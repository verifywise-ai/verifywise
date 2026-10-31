/**
 * Validates the identifiers of a vendor, the optional fields of its form that tie public records
 * to it (spec Q1): its country, company registration number, LEI and SEC CIK. Each holds the rule
 * of the server (the validators in Servers/utils/validations/vendorValidation.utils.ts), so that a
 * value the form accepts is a value the server accepts, and gives the value in the form the server
 * stores it; an empty field is no value, null, which clears the identifier.
 */

export interface IdentifierCheck {
  accepted: boolean;
  message: string;
  /** The value as the server stores it; null when the field is empty or refused. */
  value: string | null;
}

/**
 * The officially assigned codes of ISO 3166-1 alpha-2 (249), as the server lists them
 * (`ISO_COUNTRY_CODES`). Not the regions a browser can also name (EU, UN, XK, ZZ), nor an old code
 * that stands for another (UK for GB).
 */
export const ISO_COUNTRY_CODES: readonly string[] = [
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ",
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ",
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ",
  "DE DJ DK DM DO DZ",
  "EC EE EG EH ER ES ET",
  "FI FJ FK FM FO FR",
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY",
  "HK HM HN HR HT HU",
  "ID IE IL IM IN IO IQ IR IS IT",
  "JE JM JO JP",
  "KE KG KH KI KM KN KP KR KW KY KZ",
  "LA LB LC LI LK LR LS LT LU LV LY",
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ",
  "NA NC NE NF NG NI NL NO NP NR NU NZ",
  "OM",
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY",
  "QA",
  "RE RO RS RU RW",
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ",
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ",
  "UA UG UM US UY UZ",
  "VA VC VE VG VI VN VU",
  "WF WS",
  "YE YT",
  "ZA ZM ZW",
].flatMap((line) => line.split(" "));

/** The longest registration number the server keeps. */
const MAX_REGISTRATION_NUMBER_CHARS = 64;

const accepted = (value: string | null): IdentifierCheck => ({
  accepted: true,
  message: "",
  value,
});
const refused = (message: string): IdentifierCheck => ({ accepted: false, message, value: null });

/** The country: a two-letter code of ISO 3166-1 in either case, stored in upper case. */
export function checkCountry(text: string): IdentifierCheck {
  const code = text.trim().toUpperCase();
  if (code === "") return accepted(null);
  return ISO_COUNTRY_CODES.includes(code)
    ? accepted(code)
    : refused("Country must be a two-letter ISO 3166-1 code, such as DE");
}

/** The company registration number: at most 64 characters, its white space made single. */
export function checkRegistrationNumber(text: string): IdentifierCheck {
  const number = text.trim().replace(/\s+/g, " ");
  if (number === "") return accepted(null);
  return number.length > MAX_REGISTRATION_NUMBER_CHARS
    ? refused(`Registration number must be at most ${MAX_REGISTRATION_NUMBER_CHARS} characters`)
    : accepted(number);
}

/**
 * True when an LEI's check digits match (ISO 17442, ISO 7064 MOD 97-10): read with its letters as
 * 10 to 35, the whole number leaves 1 when divided by 97.
 */
function leiCheckDigitsMatch(lei: string): boolean {
  let rest = 0;
  for (const character of lei) {
    const value = parseInt(character, 36);
    rest = (rest * (value > 9 ? 100 : 10) + value) % 97;
  }
  return rest === 1;
}

/** The LEI: 18 letters or digits and 2 check digits that match, without spaces, in upper case. */
export function checkLei(text: string): IdentifierCheck {
  const lei = text.replace(/\s+/g, "").toUpperCase();
  if (lei === "") return accepted(null);
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) {
    return refused("LEI must be 18 letters or digits followed by 2 check digits");
  }
  return leiCheckDigitsMatch(lei) ? accepted(lei) : refused("LEI check digits do not match");
}

/** The SEC CIK: one to ten digits, stored as ten with zeros in front. */
export function checkSecCik(text: string): IdentifierCheck {
  const cik = text.trim();
  if (cik === "") return accepted(null);
  return /^[0-9]{1,10}$/.test(cik)
    ? accepted(cik.padStart(10, "0"))
    : refused("SEC CIK must be one to ten digits");
}
