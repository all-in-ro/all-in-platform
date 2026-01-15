import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Minimal shadcn-compatible Input.
 *
 * NOTE: Alapértelmezett (light) stílus, hogy fehér kártyákon is látszódjon:
 * - világos háttér
 * - sötét szöveg + halvány placeholder
 *
 * Ha sötét hátteren kell (pl. top bar), adj át className-ben:
 *   "bg-white/10 text-white placeholder:text-white/50 border-white/20"
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:border-slate-400",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
