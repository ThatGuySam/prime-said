import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReviewApp } from "../src/components/review/review-app.tsx";

describe("review app static shell", () => {
  test("renders shadcn source components and no eager player", () => {
    const html = renderToStaticMarkup(<ReviewApp />);

    expect(html).toContain('role="search"');
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-slot="input"');
    expect(html).toContain('data-slot="alert"');
    expect(html).toContain("bg-[#1c1b18]");
    expect(html).toContain("not an authorship or endorsement claim");
    expect(html).not.toContain("<iframe");
  });
});
