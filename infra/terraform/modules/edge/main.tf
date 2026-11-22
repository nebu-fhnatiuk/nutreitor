# Borde: todo el tráfico entra por CloudFront (ADR 0047).
#   - dominio raíz: la landing estática (S3) y, por path, /registro, /plataforma y /api
#     a la web (ADR 0028);
#   - *.dominio: el workspace de cada organización, todo a la web.
# El ALB sólo acepta conexiones desde CloudFront (prefix list administrada), así la
# IP del cliente siempre llega a dos saltos en X-Forwarded-For (TRUSTED_PROXY_HOPS=2).

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "name" {
  type = string
}

variable "root_domain" {
  description = "Dominio raíz del entorno (nutreitor.com, staging.nutreitor.com)."
  type        = string
}

variable "zone_id" {
  description = "Hosted zone de Route 53 del dominio raíz (ya existente)."
  type        = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "deletion_protection" {
  type = bool
}

# ── Certificados ──────────────────────────────────────────────────────────────

# En la región: lo presenta el ALB a CloudFront (que valida contra el Host).
resource "aws_acm_certificate" "regional" {
  domain_name               = var.root_domain
  subject_alternative_names = ["*.${var.root_domain}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# En us-east-1: CloudFront sólo toma certificados de ahí.
resource "aws_acm_certificate" "cloudfront" {
  provider                  = aws.us_east_1
  domain_name               = var.root_domain
  subject_alternative_names = ["*.${var.root_domain}"]
  validation_method         = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# Los dos certificados cubren los mismos dominios, y ACM pide el mismo registro para el
# dominio y su wildcard: alcanza con uno. Sin for_each, porque esos valores recién se
# conocen al crear el certificado y un for_each no se puede planificar con ellos.
locals {
  validation = tolist(aws_acm_certificate.regional.domain_validation_options)[0]
}

resource "aws_route53_record" "validation" {
  zone_id         = var.zone_id
  name            = local.validation.resource_record_name
  type            = local.validation.resource_record_type
  records         = [local.validation.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "regional" {
  certificate_arn         = aws_acm_certificate.regional.arn
  validation_record_fqdns = [aws_route53_record.validation.fqdn]
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [aws_route53_record.validation.fqdn]
}

# ── ALB → web ─────────────────────────────────────────────────────────────────

resource "aws_lb" "this" {
  name                       = var.name
  load_balancer_type         = "application"
  internal                   = false
  subnets                    = var.public_subnet_ids
  security_groups            = [var.alb_security_group_id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection
  idle_timeout               = 60
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name}-web"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  deregistration_delay = 30

  # Sin Host de una organización, el middleware sirve el dominio raíz; robots.txt
  # responde 200 sin tocar la API ni la base.
  health_check {
    path                = "/robots.txt"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.regional.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# ── Landing estática (S3 privado + OAC) ───────────────────────────────────────

resource "aws_s3_bucket" "site" {
  bucket_prefix = "${var.name}-site-"
  force_destroy = !var.deletion_protection
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name}-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.root.arn } }
    }]
  })
}

# Astro genera /clubes/index.html (build.format "directory"): se agrega el index.html.
resource "aws_cloudfront_function" "index" {
  name    = "${var.name}-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var r = event.request;
      if (r.uri.endsWith("/")) r.uri += "index.html";
      else if (r.uri.indexOf(".") === -1) r.uri += "/index.html";
      return r;
    }
  JS
}

# ── CloudFront ────────────────────────────────────────────────────────────────

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Reenvía Host, cookies, query y headers: la web resuelve la organización por Host.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

locals {
  alb_origin_id  = "web"
  site_origin_id = "site"
  # Lo que la web atiende en el dominio raíz (alta, consola, recuperar la contraseña).
  app_paths = ["/registro*", "/plataforma*", "/olvide*", "/restablecer*", "/api/*", "/_next/*"]
}

resource "aws_cloudfront_distribution" "root" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All" # incluye la edge de Buenos Aires
  aliases         = [var.root_domain]
  comment         = "${var.name}: landing + rutas de la web en el dominio raíz"

  origin {
    origin_id                = local.site_origin_id
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  origin {
    origin_id   = local.alb_origin_id
    domain_name = aws_lb.this.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
  }

  default_cache_behavior {
    target_origin_id           = local.site_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index.arn
    }
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.app_paths
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = local.alb_origin_id
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      compress                 = true
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_All"
  aliases         = ["*.${var.root_domain}"]
  comment         = "${var.name}: workspaces de cada organización"

  origin {
    origin_id   = local.alb_origin_id
    domain_name = aws_lb.this.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60 # el asistente puede tardar
    }
  }

  default_cache_behavior {
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  # Estáticos con hash de Next: se cachean en el borde (el Host no cambia el archivo,
  # por eso no entra en la clave de caché). Igual hay que reenviar el Host al origen:
  # sin él, CloudFront valida el certificado del ALB contra su nombre DNS y responde 502.
  ordered_cache_behavior {
    path_pattern             = "/_next/static/*"
    target_origin_id         = local.alb_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── DNS ───────────────────────────────────────────────────────────────────────

resource "aws_route53_record" "root" {
  for_each = toset(["A", "AAAA"])
  zone_id  = var.zone_id
  name     = var.root_domain
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.root.domain_name
    zone_id                = aws_cloudfront_distribution.root.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "wildcard" {
  for_each = toset(["A", "AAAA"])
  zone_id  = var.zone_id
  name     = "*.${var.root_domain}"
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = aws_cloudfront_distribution.app.hosted_zone_id
    evaluate_target_health = false
  }
}

output "web_target_group_arn" {
  value = aws_lb_target_group.web.arn
}

output "alb_arn_suffix" {
  value = aws_lb.this.arn_suffix
}

output "target_group_arn_suffix" {
  value = aws_lb_target_group.web.arn_suffix
}

output "site_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "root_distribution_id" {
  value = aws_cloudfront_distribution.root.id
}

output "listener_arn" {
  value = aws_lb_listener.https.arn
}
