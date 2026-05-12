import { useSmartPromptContext } from "../contexts/SmartPrompt.context";

export const useSmartPrompt = () => {
  const { showPrompt, dismissPrompt, hasDontAskAgain, setDontAskAgain } = useSmartPromptContext();

  return {
    showPrompt,
    dismissPrompt,
    hasDontAskAgain,
    setDontAskAgain,
  };
};
