import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center rounded-md border px-2 py-1 font-mono text-[0.65rem] font-extrabold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-[#625d55] bg-[#2b2925] text-[#f7f1e8]",
        outline: "border-[#625d55] bg-transparent text-[#c2bbb1]",
        warning: "border-[#9f8730] bg-[#453912] text-[#fff0a8]",
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
