/**
 * Primitivos de UI del producto (design system). Fuente única de los componentes
 * base; antes cada superficie reimplementaba estos estilos inline. Alineados a la
 * identidad "editorial cálido" (stone + `brand` var-driven + serif/sans). El
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
