import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 font-mono text-[0.65rem] font-extrabold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-[#171814] bg-[#e8e1d2] text-[#171814]",
        outline: "border-[#aaa69d] bg-transparent text-[#46483f]",
        warning: "border-[#171814] bg-[#ffe47a] text-[#171814]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "span";
  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
