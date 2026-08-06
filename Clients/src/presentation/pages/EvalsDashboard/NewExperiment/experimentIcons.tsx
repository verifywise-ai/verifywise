/**
 * @fileoverview Inline provider/icon wrappers used by the New Experiment wizard.
 * Large SVGs are loaded from public/ to avoid bundling them into the JS chunk.
 *
 * @module pages/EvalsDashboard/NewExperiment/experimentIcons
 */

export const HuggingFaceLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/huggingface_logo.svg"
    alt="Hugging Face"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);

export const BuildIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/build.svg"
    alt="Build"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);
