/**
 * Primitivos de UI del producto (design system). Fuente única de los componentes
 * base; antes cada superficie reimplementaba estos estilos inline. Alineados a la
 * tema Estadio (ADR 0037): escalas var-driven que se invierten en oscuro,
 * condensada de marcador (`font-display`) y colores por zona. El
 * white-label por tenant se mantiene: los acentos usan el token `brand`.
 *
 * Ver la skill `.agents/skills/ui-ux-pro-max/design-system/nutreitor/MASTER.md`.
 */
export { cn } from "./cn";
export { Card, SectionHeading } from "./card";
export { Button, buttonClass, type ButtonVariant, type ButtonSize } from "./button";
export { Input, Textarea, Select, Label, fieldClass } from "./field";
export { Toggle } from "./toggle";
export { Alert, Spinner, Loading, EmptyState, type AlertTone } from "./feedback";
export { Modal, SlideOver } from "./overlay";
export { PageHeader } from "./page-header";
export { Tabs, tabPanelProps, type TabItem } from "./tabs";
export { FeedbackProvider, useFeedback, type ConfirmOptions } from "./feedback-provider";
export { ThemeToggle } from "./theme-toggle";
export {
  ZoneBadge,
  ZoneMark,
  Stat,
  ZONE_LABEL,
  zoneText,
  zoneFill,
  zoneSoft,
  type Zone,
} from "./zone";
