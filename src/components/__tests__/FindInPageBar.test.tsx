import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FindInPageBar } from "../FindInPageBar";

function noop() {}

describe("FindInPageBar", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <FindInPageBar
        open={false}
        query=""
        matches={0}
        current={-1}
        onChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the input and auto-focuses it when open=true", () => {
    render(
      <FindInPageBar
        open={true}
        query=""
        matches={0}
        current={-1}
        onChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />,
    );
    const input = screen.getByRole("textbox", { name: /find in page/i });
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it("typing fires onChange with the new value", () => {
    const onChange = vi.fn();
    render(
      <FindInPageBar
        open={true}
        query=""
        matches={0}
        current={-1}
        onChange={onChange}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />,
    );
    const input = screen.getByRole("textbox", { name: /find in page/i });
    fireEvent.change(input, { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("abc");
  });

  it("Enter fires onNext, Shift+Enter fires onPrev, Escape fires onClose", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onClose = vi.fn();
    render(
      <FindInPageBar
        open={true}
        query="x"
        matches={3}
        current={0}
        onChange={noop}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />,
    );
    const input = screen.getByRole("textbox", { name: /find in page/i });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("counter renders 'current of matches' (1-indexed) when there are matches", () => {
    render(
      <FindInPageBar
        open={true}
        query="x"
        matches={5}
        current={2}
        onChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("3 of 5")).toBeInTheDocument();
  });

  it("counter renders '0 of 0' when there are no matches", () => {
    render(
      <FindInPageBar
        open={true}
        query="zzz"
        matches={0}
        current={-1}
        onChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />,
    );
    expect(screen.getByText("0 of 0")).toBeInTheDocument();
  });
});
