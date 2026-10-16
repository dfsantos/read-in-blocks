import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the app heading and a button", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Read in Blocks" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
