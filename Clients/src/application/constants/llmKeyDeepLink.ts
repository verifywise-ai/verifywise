/** Query flag that opens the LLM key create form on Settings > API Keys. */
export const LLM_KEY_ADD_PARAM = "addKey";

/** Settings page that lists the organization's LLM keys. */
export const LLM_KEYS_PATH = "/settings/apikeys";

/** Settings path that lands on the LLM key form. */
export const LLM_KEY_CREATE_PATH = `${LLM_KEYS_PATH}?${LLM_KEY_ADD_PARAM}=1`;
