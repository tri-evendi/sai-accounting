"use client";

/**
 * Collapsible (issue #51) — re-ekspor tipis Radix Collapsible, pola
 * shadcn/ui. Tanpa gaya bawaan: pemakainya (`DisclosureSection`) yang
 * menata; Radix menyumbang `aria-expanded`/`aria-controls` + toggle
 * keyboard yang benar pada trigger.
 */

import { Collapsible as CollapsiblePrimitive } from "radix-ui";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
