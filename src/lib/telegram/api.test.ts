import { describe, expect, it } from "vitest";
import { escapeHtml } from "./api";

describe("telegram html sanitization", () => {
  it("escapes HTML special characters to prevent Telegram parse injection", () => {
    expect(escapeHtml('<script>alert("xss")</script> & <b>bold</b>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;"
    );
  });
});
