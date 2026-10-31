/**
 * The vendor risk form as the tests of the research findings see it. The form has its own tests
 * (Modals/NewRisk); here it stands in for itself and does what it does with a preview: show the
 * draft, hand what is "on screen" (the draft's values, and whatever a test put in `formEdits`) to
 * `onSave` when Save is clicked, close after a save that worked, and stay open when it failed.
 * Without a preview it is the page's own editor, which these tests never open.
 *
 * A test file mocks the form with it:
 *
 *   vi.mock("<path>/components/Modals/NewRisk", async () => ({
 *     default: (await import("./vendorRiskFormStub")).VendorRiskFormStub,
 *   }));
 */

import type { VendorRiskPreview } from "../../../../../domain/interfaces/i.vendor";
import { formEdits } from "./fixtures";

interface VendorRiskFormStubProps {
  isOpen: boolean;
  setIsOpen: () => void;
  preview?: VendorRiskPreview | null;
}

export function VendorRiskFormStub({ isOpen, setIsOpen, preview }: VendorRiskFormStubProps) {
  if (!isOpen || !preview) return null;
  const { values } = preview;
  const save = async () => {
    try {
      await preview.onSave({
        vendor_id: values.vendor_id,
        risk_description: values.risk_description,
        impact_description: values.impact_description,
        action_owner: values.action_owner === null ? undefined : String(values.action_owner),
        action_plan: values.action_plan,
        risk_severity: values.risk_severity,
        risk_level: "High risk",
        likelihood: values.likelihood,
        frameworks: [],
        ...formEdits.current,
      });
      setIsOpen();
    } catch {
      // Stays open, as the real form does.
    }
  };
  return (
    <div role="dialog" aria-labelledby="vendor-risk-form-title">
      <h2 id="vendor-risk-form-title">{preview.title}</h2>
      <p>{preview.description}</p>
      <output aria-label="Values of the draft" data-vw-no-translate="true">
        {JSON.stringify(values)}
      </output>
      <button onClick={() => void save()}>Save</button>
      <button onClick={setIsOpen}>Cancel</button>
    </div>
  );
}
