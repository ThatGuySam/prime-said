import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-sm font-extrabold transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-[#2f5bea]/35 focus-visible:border-[#2f5bea] [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[#171814] text-[#fffdf6] hover:bg-[#2f302b]",
        accent: "border-[#171814] bg-[#d7ff36] text-[#171814] hover:bg-[#c8f020]",
        outline: "border-[#aaa69d] bg-transparent text-[#171814] hover:border-[#171814] hover:bg-[#ebe6da]",
        ghost: "bg-transparent text-[#171814] hover:bg-[#ebe6da]",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 min-h-9 rounded-sm px-3 text-xs",
        icon: "size-11 min-h-11 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
