/**
 * BrandFetch API Configuration
 *
 * This configuration file stores the BrandFetch API credentials
 * used to fetch company logos for vendors.
 *
 * Required environment variables:
 * - VITE_BRANDFETCH_API_KEY: Your BrandFetch API key
 *
 * @see https://brandfetch.com/
 */

export const BRANDFETCH_CONFIG = {
  /**
   * BrandFetch API Key
   * Used in the URL parameter: https://cdn.brandfetch.io/{domain}?c={apiKey}
   * Loaded from environment variable VITE_BRANDFETCH_API_KEY
   */
  API_KEY: import.meta.env.VITE_BRANDFETCH_API_KEY || "",

  /**
   * Base URL for BrandFetch CDN
   */
  CDN_BASE_URL: "https://cdn.brandfetch.io",
};

/**
 * Extracts domain from various URL formats
 * @param url - The URL or domain string
 * @returns The domain name without protocol or path
 *
 * @example
 * extractDomain('https://www.apple.com/products') // returns 'apple.com'
 * extractDomain('apple.com') // returns 'apple.com'
 * extractDomain('www.apple.com') // returns 'apple.com'
 */
export const extractDomain = (url: string): string => {
  if (!url) return "";

  try {
    // Remove protocol if present
    let domain = url.replace(/^https?:\/\//, "");

    // Remove www. prefix
    domain = domain.replace(/^www\./, "");

    // Remove path and query parameters
    domain = domain.split("/")[0].split("?")[0];

    return domain.toLowerCase();
  } catch (error) {
    console.error("Error extracting domain:", error);
    return "";
  }
};

/**
 * Generates BrandFetch logo URL for a given domain/website
 * @param website - The vendor's website URL or domain
 * @returns The complete BrandFetch CDN URL for the logo
 *
 * @example
 * getBrandFetchUrl('https://apple.com') // returns 'https://cdn.brandfetch.io/apple.com?c=1id...'
 */
export const getBrandFetchUrl = (website: string): string => {
  const domain = extractDomain(website);
  if (!domain) return "";

  return `${BRANDFETCH_CONFIG.CDN_BASE_URL}/${domain}?c=${BRANDFETCH_CONFIG.API_KEY}`;
};
