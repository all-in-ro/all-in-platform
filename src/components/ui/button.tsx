import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
};

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(" ");
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 disabled:pointer-events-none";

    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      default: "bg-[#354153] text-white hover:bg-[#3c5069] border border-white/30",
      outline: "bg-transparent text-white border border-white/30 hover:bg-white/10",
      ghost: "bg-transparent text-white hover:bg-white/10"
    };

    const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
      default: "h-10 px-4",
      sm: "h-9 px-3",
      lg: "h-12 px-5"
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button"; 
