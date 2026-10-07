/** Query flag that opens the LLM key create form on Settings > API Keys. */
export const LLM_KEY_ADD_PARAM = "addKey";

/** Settings path that lands on the LLM key form. */
export const LLM_KEY_CREATE_PATH = `/settings/apikeys?${LLM_KEY_ADD_PARAM}=1`;
