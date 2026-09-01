// Place at: tests/components/setup.ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom doesn't implement Element.scrollTo at all (it has no real layout
// engine to scroll) - components that call it to keep a message list
// pinned to the bottom would otherwise throw in every test that renders
// them, for a browser API gap that has nothing to do with the
// component's own logic.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Without this, DOM nodes rendered by one test file's cases would still
// be attached to jsdom's document when the next case runs, so a query
// like getByRole could match a leftover element from a previous render
// instead of failing cleanly.
afterEach(() => {
  cleanup();
});
