import { FC, useEffect, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { colors, typography, spacing, border } from "./styles/theme";
import { getLLMKeys } from "../../../application/repository/llmKeys.repository";
import { LLMKeysModel } from "../../../domain/models/Common/llmKeys/llmKeys.model";

interface AdvisorHeaderProps {
  onClose: () => void;
  selectedLLMKeyId?: number;
  onLLMKeyChange?: (keyId: number) => void;
  onLLMKeysLoaded?: (hasKeys: boolean, isLoading: boolean) => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
}

const AdvisorHeader: FC<AdvisorHeaderProps> = ({
  onClose,
  selectedLLMKeyId,
  onLLMKeyChange,
  onLLMKeysLoaded,
  isEnlarged = false,
  onToggleEnlarge,
}) => {
  const [llmKeys, setLLMKeys] = useState<LLMKeysModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLLMKeys = async () => {
      try {
        const response = await getLLMKeys();
        const keys = response.data.data?.map((key: LLMKeysModel) => new LLMKeysModel(key)) || [];
        setLLMKeys(keys);

        // Notify parent about keys status
        onLLMKeysLoaded?.(keys.length > 0, false);

        // Auto-select first key if none selected or if saved key is not in the list
        if (keys.length > 0 && onLLMKeyChange) {
          const savedKeyExists =
            selectedLLMKeyId && keys.some((k: LLMKeysModel) => k.id === selectedLLMKeyId);
          if (!savedKeyExists) {
            onLLMKeyChange(keys[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to fetch LLM keys:", error);
        onLLMKeysLoaded?.(false, false);
      } finally {
        setLoading(false);
      }
    };

    onLLMKeysLoaded?.(false, true);
    fetchLLMKeys();
  }, [selectedLLMKeyId, onLLMKeyChange, onLLMKeysLoaded]);

  const handleKeyChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const keyId = parseInt(event.target.value);
    if (onLLMKeyChange) {
      onLLMKeyChange(keyId);
    }
  };

  return (
    <div
      style={{
        backgroundColor: colors.background.white,
        borderBottom: border.default,
        padding: `${spacing.sm} ${spacing.md}`,
      }}
    >
      {/* Main header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.sm,
        }}
      >
        <span
          style={{
            fontFamily: typography.fontFamily.sans,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.medium,
            color: colors.text.primary,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          AI advisor
        </span>

        {/* Right side: LLM Key Selector and Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            flexShrink: 0,
          }}
        >
          {/* LLM Key Dropdown - only show if more than 1 key */}
          {!loading && llmKeys.length > 1 && (
            <select
              value={selectedLLMKeyId || ""}
              onChange={handleKeyChange}
              style={{
                fontFamily: typography.fontFamily.sans,
                fontSize: typography.fontSize.xs,
                padding: `4px 8px`,
                borderRadius: border.radius,
                border: `1px solid ${colors.border?.default || "#e5e7eb"}`,
                backgroundColor: colors.background.white,
                color: colors.text.primary,
                cursor: "pointer",
                outline: "none",
              }}
              title="Select AI model"
            >
              {llmKeys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.model}
                </option>
              ))}
            </select>
          )}

          {/* Enlarge/Shrink button */}
          {onToggleEnlarge && (
            <button
              onClick={onToggleEnlarge}
              className="header-icon-button"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                backgroundColor: "transparent",
                border: "none",
                borderRadius: border.radius,
                cursor: "pointer",
                color: colors.text.secondary,
              }}
              title={isEnlarged ? "Shrink" : "Enlarge"}
            >
              {isEnlarged ? (
                <Minimize2 size={14} strokeWidth={1.5} />
              ) : (
                <Maximize2 size={14} strokeWidth={1.5} />
              )}
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="header-icon-button"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              backgroundColor: "transparent",
              border: "none",
              borderRadius: border.radius,
              cursor: "pointer",
              color: colors.text.secondary,
            }}
            title="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdvisorHeader;
