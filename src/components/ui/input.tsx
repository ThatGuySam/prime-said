import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-14 min-w-0 flex-1 rounded-md border border-[#625d55] bg-[#11100f] px-4 text-base text-[#f7f1e8] outline-none placeholder:text-[#8d867d] focus-visible:border-[#7aa2ff] focus-visible:ring-3 focus-visible:ring-[#7aa2ff]/25 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
