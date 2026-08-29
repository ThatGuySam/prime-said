import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-14 min-w-0 flex-1 rounded-md border border-[#aaa69d] bg-white px-4 text-base text-[#171814] outline-none placeholder:text-[#777a70] focus-visible:border-[#2f5bea] focus-visible:ring-3 focus-visible:ring-[#2f5bea]/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
