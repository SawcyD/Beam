import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind conflicts (shadcn idiom). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
