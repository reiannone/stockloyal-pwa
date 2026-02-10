// test-data-generator.js
// Generates realistic randomized member data for onboarding automation
// No external dependencies — pure JS with built-in data pools

// ── Name pools ─────────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda",
  "David","Elizabeth","William","Barbara","Richard","Susan","Joseph","Jessica",
  "Thomas","Sarah","Charles","Karen","Christopher","Lisa","Daniel","Nancy",
  "Matthew","Betty","Anthony","Margaret","Mark","Sandra","Donald","Ashley",
  "Steven","Kimberly","Andrew","Emily","Paul","Donna","Joshua","Michelle",
  "Kenneth","Carol","Kevin","Amanda","Brian","Dorothy","George","Melissa",
  "Timothy","Deborah","Ronald","Stephanie","Edward","Rebecca","Jason","Sharon",
  "Jeffrey","Laura","Ryan","Cynthia","Jacob","Kathleen","Gary","Amy",
  "Nicholas","Angela","Eric","Shirley","Jonathan","Anna","Stephen","Brenda",
  "Larry","Pamela","Justin","Emma","Scott","Nicole","Brandon","Helen",
  "Benjamin","Samantha","Samuel","Katherine","Raymond","Christine","Gregory","Debra",
  "Frank","Rachel","Alexander","Carolyn","Patrick","Janet","Jack","Catherine",
  "Dennis","Maria","Jerry","Heather","Tyler","Diane","Aaron","Ruth",
  "Jose","Julie","Adam","Olivia","Nathan","Joyce","Henry","Virginia",
  "Aiden","Sofia","Liam","Isabella","Noah","Mia","Ethan","Charlotte",
  "Mason","Amelia","Logan","Harper","Lucas","Evelyn","Owen","Abigail",
  "Caleb","Ella","Aria","Scarlett","Riley","Grace","Zoey","Lily",
  "Nora","Chloe","Layla","Penelope","Luna","Hazel","Violet","Ellie",
];

const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis",
  "Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas",
  "Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White",
  "Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young",
  "Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell",
  "Carter","Roberts","Gomez","Phillips","Evans","Turner","Diaz","Parker",
  "Cruz","Edwards","Collins","Reyes","Stewart","Morris","Morales","Murphy",
  "Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper","Peterson","Bailey",
  "Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson",
  "Watson","Brooks","Chavez","Wood","James","Bennett","Gray","Mendoza",
  "Ruiz","Hughes","Price","Alvarez","Castillo","Sanders","Patel","Myers",
  "Long","Ross","Foster","Jimenez","Powell","Jenkins","Perry","Russell",
  "Sullivan","Bell","Coleman","Butler","Henderson","Barnes","Gonzales","Fisher",
  "Vasquez","Simmons","Griffin","Webb","Bryant","Alexander","Hamilton","Graham",
  "Wallace","Hart","Hawkins","Hicks","George","Warren","Dixon","Owens",
];

const MIDDLE_NAMES = [
  "","","","","",  // 50% chance of no middle name
  "A","B","C","D","E","J","K","L","M","N","R","S","T","W",
  "Ann","Lee","Marie","James","Michael","Ray","Lynn","Jean",
  "Rose","Mae","Grace","Paul","John","Thomas","Edward","Robert",
];

// ── Address pools ──────────────────────────────────────────────────────────────
const STREETS = [
  "Main St","Oak Ave","Maple Dr","Cedar Ln","Pine Rd","Elm St","Washington Ave",
  "Park Pl","Lake Dr","Hill Rd","River Rd","Sunset Blvd","Forest Ave","Spring St",
  "Church St","Mill Rd","School St","Garden Dr","Meadow Ln","Valley Rd",
  "Highland Ave","Prospect St","Center St","Bridge Rd","Union St","Academy St",
  "Liberty St","Franklin Ave","Jefferson Dr","Lincoln Blvd","Jackson St",
  "Monroe Dr","Madison Ave","Harrison Rd","Tyler Ct","Polk St","Taylor Dr",
];

const CITIES_STATES_ZIPS = [
  { city: "New York", state: "NY", zip: "10001" },
  { city: "Los Angeles", state: "CA", zip: "90001" },
  { city: "Chicago", state: "IL", zip: "60601" },
  { city: "Houston", state: "TX", zip: "77001" },
  { city: "Phoenix", state: "AZ", zip: "85001" },
  { city: "Philadelphia", state: "PA", zip: "19101" },
  { city: "San Antonio", state: "TX", zip: "78201" },
  { city: "San Diego", state: "CA", zip: "92101" },
  { city: "Dallas", state: "TX", zip: "75201" },
  { city: "Austin", state: "TX", zip: "73301" },
  { city: "Jacksonville", state: "FL", zip: "32099" },
  { city: "San Jose", state: "CA", zip: "95101" },
  { city: "Fort Worth", state: "TX", zip: "76101" },
  { city: "Columbus", state: "OH", zip: "43085" },
  { city: "Charlotte", state: "NC", zip: "28201" },
  { city: "Indianapolis", state: "IN", zip: "46201" },
  { city: "San Francisco", state: "CA", zip: "94101" },
  { city: "Seattle", state: "WA", zip: "98101" },
  { city: "Denver", state: "CO", zip: "80201" },
  { city: "Nashville", state: "TN", zip: "37201" },
  { city: "Portland", state: "OR", zip: "97201" },
  { city: "Las Vegas", state: "NV", zip: "89101" },
  { city: "Memphis", state: "TN", zip: "38101" },
  { city: "Louisville", state: "KY", zip: "40201" },
  { city: "Baltimore", state: "MD", zip: "21201" },
  { city: "Milwaukee", state: "WI", zip: "53201" },
  { city: "Albuquerque", state: "NM", zip: "87101" },
  { city: "Tucson", state: "AZ", zip: "85701" },
  { city: "Fresno", state: "CA", zip: "93650" },
  { city: "Sacramento", state: "CA", zip: "94203" },
  { city: "Atlanta", state: "GA", zip: "30301" },
  { city: "Omaha", state: "NE", zip: "68101" },
  { city: "Raleigh", state: "NC", zip: "27601" },
  { city: "Miami", state: "FL", zip: "33101" },
  { city: "Minneapolis", state: "MN", zip: "55401" },
  { city: "Tampa", state: "FL", zip: "33601" },
  { city: "Cleveland", state: "OH", zip: "44101" },
  { city: "Pittsburgh", state: "PA", zip: "15201" },
  { city: "St. Louis", state: "MO", zip: "63101" },
  { city: "Cincinnati", state: "OH", zip: "45201" },
];

const TIMEZONES = [
  "America/New_York","America/Chicago","America/Denver",
  "America/Los_Angeles","America/Phoenix","Pacific/Honolulu",
];

// ── Stock tickers for order simulation ─────────────────────────────────────────
const STOCK_TICKERS = [
  "AAPL","GOOGL","MSFT","AMZN","TSLA","META","NVDA","JPM",
  "V","WMT","DIS","NFLX","PYPL","INTC","AMD","CRM",
  "COST","HD","NKE","SBUX","BA","GE","PFE","KO","PEP",
  "MCD","T","VZ","CSCO","ORCL","ADBE","QCOM","TXN",
];

// ── Default merchant for demo-inbound ──────────────────────────────────────────
const DEFAULT_MERCHANT_ID = "merchant001";

// ── Email domains ──────────────────────────────────────────────────────────────
const EMAIL_DOMAINS = [
  "gmail.com","yahoo.com","outlook.com","hotmail.com","aol.com",
  "icloud.com","mail.com","protonmail.com","zoho.com","yandex.com",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function padZero(n, len = 4) {
  return String(n).padStart(len, "0");
}

// ── Main generator ─────────────────────────────────────────────────────────────

/**
 * Generate a single test member profile
 * @param {number} index - Sequential index (used for unique IDs)
 * @param {object} opts - Override options
 * @returns {object} Complete member profile for onboarding
 */
export function generateMember(index, opts = {}) {
  const firstName = opts.firstName || pick(FIRST_NAMES);
  const lastName  = opts.lastName  || pick(LAST_NAMES);
  const middleName = opts.middleName ?? pick(MIDDLE_NAMES);
  const loc = pick(CITIES_STATES_ZIPS);

  const memberId = opts.memberId || `robot-${padZero(index, 5)}`;
  const emailUser = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randInt(1, 999)}`;
  const email = opts.email || `${emailUser}@${pick(EMAIL_DOMAINS)}`;

  return {
    // ── Identity ──
    index,
    memberId,
    firstName,
    middleName,
    lastName,
    email,

    // ── Address ──
    addressLine1: `${randInt(100, 9999)} ${pick(STREETS)}`,
    addressLine2: Math.random() < 0.2 ? `Apt ${randInt(1, 999)}` : "",
    city: loc.city,
    state: loc.state,
    zip: loc.zip,
    country: "US",
    timezone: pick(TIMEZONES),

    // ── Broker credentials ──
    broker: opts.broker || "Robinhood",
    brokerUsername: memberId,  // broker username = StockLoyal member_id
    // Password different from username to avoid rejection test case
    brokerPassword: `Str0ng!${lastName}${randInt(100, 9999)}`,

    // ── Stock preferences ──
    stockPicks: opts.stockPicks || [
      pick(STOCK_TICKERS),
      pick(STOCK_TICKERS),
    ].filter((v, i, a) => a.indexOf(v) === i), // dedupe

    // ── Points (for members with pre-loaded points) ──
    points: opts.points ?? randInt(500, 50000),
  };
}

/**
 * Generate a batch of unique test members
 * @param {number} count - How many to generate
 * @param {object} opts - Shared options (broker, etc.)
 * @returns {object[]} Array of member profiles
 */
export function generateBatch(count, opts = {}) {
  const members = [];
  const usedIds = new Set();

  for (let i = 1; i <= count; i++) {
    let member;
    do {
      member = generateMember(i, { ...opts, memberId: `robot-${padZero(i, 5)}` });
    } while (usedIds.has(member.memberId));

    usedIds.add(member.memberId);
    members.push(member);
  }

  return members;
}

/**
 * Generate a single member designed to FAIL broker validation
 * (username === password triggers rejection in broker-receiver.php)
 */
export function generateFailMember(index) {
  const member = generateMember(index, { memberId: `robot-fail-${padZero(index, 4)}` });
  member.brokerPassword = member.brokerUsername; // triggers rejection
  return member;
}
