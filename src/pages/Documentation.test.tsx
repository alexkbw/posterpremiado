import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import Documentation from "./Documentation";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    session: null,
    signOut: vi.fn(),
    user: null,
  }),
}));

class IntersectionObserverMock {
  disconnect() {}

  observe() {}

  unobserve() {}
}

describe("Documentation page", () => {
  beforeAll(() => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("renders the public documentation route with section anchors and metadata", () => {
    render(
      <MemoryRouter initialEntries={["/documentacao"]}>
        <Routes>
          <Route element={<Documentation />} path="/documentacao" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Documentacao do Usuario/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1\. Visao geral/i })).toHaveAttribute("href", "#1-visao-geral");
    expect(document.getElementById("1-visao-geral")).not.toBeNull();
    expect(screen.getAllByText(/Conteudo em atualizacao/i).length).toBeGreaterThan(0);
    expect(document.title).toBe("Documentacao do Usuario | PosterPremiado");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toContain(
      "O PosterPremiado e uma plataforma",
    );
  });
});
