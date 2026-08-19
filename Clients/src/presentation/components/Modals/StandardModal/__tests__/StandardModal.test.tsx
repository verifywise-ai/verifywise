import { screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StandardModal from "../index";

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  title: "Test Modal",
  description: "Test description",
};

const getForm = (container: HTMLElement) =>
  container.ownerDocument.body.querySelector("form") as HTMLFormElement;

describe("StandardModal", () => {
  describe("open/close behaviour", () => {
    it("renders title, description and children when open", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByText("Test Modal")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
      expect(screen.getByText("Modal content")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      renderWithProviders(
        <StandardModal {...baseProps} isOpen={false} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.queryByText("Modal content")).not.toBeInTheDocument();
      expect(screen.queryByText("Test Modal")).not.toBeInTheDocument();
    });

    it("calls onClose when Escape is pressed", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={onClose}>
          <div>Modal content</div>
        </StandardModal>,
      );

      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when the backdrop is clicked", () => {
      const onClose = vi.fn();

      const { baseElement } = renderWithProviders(
        <StandardModal {...baseProps} onClose={onClose}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const backdrop = baseElement.querySelector(".MuiBackdrop-root");
      expect(backdrop).toBeTruthy();

      fireEvent.click(backdrop as Element);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("renders without children for confirmation-style dialogs", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={vi.fn()} />,
      );

      expect(screen.getByText("Test Modal")).toBeInTheDocument();
      expect(getForm(container)).toBeNull();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });
  });

  describe("submit flow", () => {
    it("calls onSubmit when the submit button is clicked", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={onSubmit}>
          <div>Modal content</div>
        </StandardModal>,
      );

      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("does not render a submit button when onSubmit is not provided", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("disables the submit button while isSubmitting is true", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={onSubmit} isSubmitting>
          <div>Modal content</div>
        </StandardModal>,
      );

      const submitButton = screen.getByRole("button", { name: "Save" });
      expect(submitButton).toBeDisabled();

      await user.click(submitButton, { pointerEventsCheck: 0 });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("hides the submit button but keeps Cancel when hideSubmitButton is true", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={vi.fn()} hideSubmitButton>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    it("submits the form on Enter via the hidden submit button", async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={onSubmit}>
          <input aria-label="Name" />
        </StandardModal>,
      );

      await user.type(screen.getByLabelText("Name"), "hello{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("ignores form submission while isSubmitting is true", () => {
      const onSubmit = vi.fn();

      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={onSubmit} isSubmitting>
          <input aria-label="Name" />
        </StandardModal>,
      );

      fireEvent.submit(getForm(container));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not throw when the form is submitted without onSubmit", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <input aria-label="Name" />
        </StandardModal>,
      );

      expect(() => fireEvent.submit(getForm(container))).not.toThrow();
    });
  });

  describe("footer variants", () => {
    it("renders custom submit and cancel button text", () => {
      renderWithProviders(
        <StandardModal
          {...baseProps}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          submitButtonText="Create"
          cancelButtonText="Discard"
        >
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    });

    it("calls onClose when the cancel button is clicked", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={onClose} onSubmit={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("replaces the default footer with customFooter", () => {
      renderWithProviders(
        <StandardModal
          {...baseProps}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          customFooter={<button type="button">Next step</button>}
        >
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByRole("button", { name: "Next step" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });

    it("renders no footer buttons when hideFooter is true", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={vi.fn()} hideFooter>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
      expect(screen.getByText("Modal content")).toBeInTheDocument();
    });

    it("removes the cancel and close buttons when showCancelButton is false", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={vi.fn()} showCancelButton={false}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("applies a custom submit button colour", () => {
      renderWithProviders(
        <StandardModal
          {...baseProps}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          submitButtonText="Delete"
          submitButtonColor="#c62828"
        >
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByRole("button", { name: "Delete" })).toHaveStyle({
        backgroundColor: "#c62828",
      });
    });
  });

  describe("header", () => {
    it("calls onClose when the close icon button is clicked", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();

      renderWithProviders(
        <StandardModal {...baseProps} onClose={onClose}>
          <div>Modal content</div>
        </StandardModal>,
      );

      await user.click(screen.getByRole("button", { name: "Close dialog" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders headerActions before the close button", () => {
      const { baseElement } = renderWithProviders(
        <StandardModal
          {...baseProps}
          onClose={vi.fn()}
          headerActions={<button type="button">History</button>}
        >
          <div>Modal content</div>
        </StandardModal>,
      );

      const historyButton = screen.getByRole("button", { name: "History" });
      const closeButton = screen.getByRole("button", { name: "Close dialog" });

      expect(historyButton.parentElement).toBe(closeButton.parentElement);
      expect(
        historyButton.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(baseElement).getByText("Test Modal")).toBeInTheDocument();
    });
  });

  describe("layout props", () => {
    it("uses the default max width when none is given", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByText("Test Modal").closest("[role='presentation'] > div")).toHaveStyle({
        width: "760px",
      });
    });

    it("applies a custom maxWidth", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} maxWidth="1000px">
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByText("Test Modal").closest("[role='presentation'] > div")).toHaveStyle({
        width: "1000px",
      });
    });

    it("uses the default content max height", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(getForm(container)).toHaveStyle({ maxHeight: "calc(100vh - 240px)" });
    });

    it("applies the expanded content max height", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} expandedHeight>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(getForm(container)).toHaveStyle({ maxHeight: "min(740px, calc(90vh - 180px))" });
    });

    it("applies the fitContent max height, taking precedence over expandedHeight", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} fitContent expandedHeight>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(getForm(container)).toHaveStyle({ maxHeight: "calc(90vh - 180px)" });
    });
  });

  describe("accessibility", () => {
    it("points aria-labelledby and aria-describedby at the title and description", () => {
      const { baseElement } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const modal = baseElement.querySelector("[role='presentation']") as HTMLElement;
      const labelledBy = modal.getAttribute("aria-labelledby");
      const describedBy = modal.getAttribute("aria-describedby");

      expect(labelledBy).toBeTruthy();
      expect(describedBy).toBeTruthy();
      expect(labelledBy).not.toBe(describedBy);
      expect(baseElement.querySelector(`#${CSS.escape(labelledBy as string)}`)).toHaveTextContent(
        "Test Modal",
      );
      expect(baseElement.querySelector(`#${CSS.escape(describedBy as string)}`)).toHaveTextContent(
        "Test description",
      );
    });

    it("renders the title as a heading and the description as a paragraph", () => {
      renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      expect(screen.getByRole("heading", { name: "Test Modal", level: 2 })).toBeInTheDocument();
      expect(screen.getByText("Test description").tagName).toBe("P");
    });

    it("moves focus into the modal when opened", () => {
      const { baseElement } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const modal = baseElement.querySelector("[role='presentation']") as HTMLElement;
      expect(modal.contains(document.activeElement)).toBe(true);
    });

    it("hides the Enter-key helper submit button from assistive technology", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()} onSubmit={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const hiddenSubmit = getForm(container).querySelector("button[type='submit']") as HTMLElement;
      expect(hiddenSubmit).toHaveAttribute("aria-hidden", "true");
      expect(hiddenSubmit).toHaveStyle({ display: "none" });
    });
  });

  describe("scroll handling", () => {
    it("stops wheel propagation while the content is mid-scroll", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const form = getForm(container);
      Object.defineProperty(form, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(form, "clientHeight", { value: 200, configurable: true });
      form.scrollTop = 100;

      const onWheel = vi.fn();
      container.ownerDocument.body.addEventListener("wheel", onWheel);

      fireEvent.wheel(form, { deltaY: 50 });
      expect(onWheel).not.toHaveBeenCalled();

      container.ownerDocument.body.removeEventListener("wheel", onWheel);
    });

    it("stops wheel propagation when scrolling up away from the top", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const form = getForm(container);
      Object.defineProperty(form, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(form, "clientHeight", { value: 200, configurable: true });
      form.scrollTop = 100;

      const onWheel = vi.fn();
      container.ownerDocument.body.addEventListener("wheel", onWheel);

      fireEvent.wheel(form, { deltaY: -50 });
      expect(onWheel).not.toHaveBeenCalled();

      container.ownerDocument.body.removeEventListener("wheel", onWheel);
    });

    it("stops propagation for a horizontal wheel while mid-scroll", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const form = getForm(container);
      Object.defineProperty(form, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(form, "clientHeight", { value: 200, configurable: true });
      form.scrollTop = 100;

      const onWheel = vi.fn();
      container.ownerDocument.body.addEventListener("wheel", onWheel);

      fireEvent.wheel(form, { deltaY: 0, deltaX: 50 });
      expect(onWheel).not.toHaveBeenCalled();

      container.ownerDocument.body.removeEventListener("wheel", onWheel);
    });

    it("lets the wheel event bubble when the content cannot scroll further", () => {
      const { container } = renderWithProviders(
        <StandardModal {...baseProps} onClose={vi.fn()}>
          <div>Modal content</div>
        </StandardModal>,
      );

      const form = getForm(container);
      Object.defineProperty(form, "scrollHeight", { value: 200, configurable: true });
      Object.defineProperty(form, "clientHeight", { value: 200, configurable: true });
      form.scrollTop = 0;

      const onWheel = vi.fn();
      container.ownerDocument.body.addEventListener("wheel", onWheel);

      fireEvent.wheel(form, { deltaY: 50 });
      expect(onWheel).toHaveBeenCalledTimes(1);

      container.ownerDocument.body.removeEventListener("wheel", onWheel);
    });
  });
});
