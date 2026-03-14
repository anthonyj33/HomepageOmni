// Homepage Omni
// Cadecraft
// v1.0.0; 2025/12/25

/* TODO:
	Feat: allow changing your search engine
	Fix: timing countdowns after midnight
	Colors: change slightly? Allow customization?
	Test: clocks for different time zones
	Release: publish for Firefox

	Docs: update documentation to match
	Docs: update example configs to match
*/

// Data
let links_filtered = [];
let selectedi = 0; // The current index selected from links_filtered
let display_when_empty = true; // Whether to display when the box is empty
let error_text = "";
// The default config
const CONFIG_DEFAULT = {
	"display_when_empty": true,
	// Links: { key (display name), href (URL to go to) }
	"links": [
		{ key: "Example Link", href: "https://example.com" },
		{ key: "Google", href: "https://google.com" },
		{ key: "GitHub", href: "https://github.com" },
		{ key: "YouTube", href: "https://youtube.com/" },
	],
	// Events: { name (display name), hr (1..=23), min (0..=59) }
	"events": [],
	"event_display_duration_mins": 60,
	// Clocks (by default, only show clock 1)
	"clock1_name": "",
	"clock_use_24h": true,
	"clock_show_seconds": false,
	"clock2_name": "hidden",
	"clock2_utc_offset": 0,
	"clock3_name": "hidden",
	"clock3_utc_offset": 0,
	"bar_placeholder": "Filter criteria, :command, =address, -search, +custom",
	// Search URL prefix (e.g. "https://duckduckgo.com/")
	"search_url_prefix": "https://google.com/search",
	"theme": {
		"mainbg": "#2b2a33",
		"lightbg": "#42414d",
		"midbg": "#353440",
		"blue": "#5aa5c2",
		"bluedark": "#498cad"
	},
	// Templates: id maps to template string
	"templates": {}
};
// The actual config
let config = structuredClone(CONFIG_DEFAULT);

// Determine browser type
// TODO: better way of determining browser type?
const is_chrome = navigator.userAgent.includes("Chrome");

// Set a key and return whether successful
function setLink(new_key, new_href) {
	const disallowed = [":", "=", "-", "+"];
	if (new_key.trim().length == 0) {
		error_text = "Name must not be empty";
		return false;
	} else if (disallowed.some(d => new_key.trim().startsWith(d))) {
		error_text = `Name cannot start with these characters: ${disallowed.reduce((a, b) => a + b)}`;
		return false;
	} else if (new_href.includes(",")) {
		error_text = "URL cannot contain commas";
		return false;
	}

	const foundIndex = config.links.findIndex((l) => (
		l.key.toLowerCase().trim() === new_key.toLowerCase().trim()
	));

	if (foundIndex == -1) {
		config.links.push({
			key: new_key.trim(),
			href: new_href.trim()
		});
	} else {
		config.links[foundIndex].href = new_href.trim();
	}
	saveConfig();
	return true;
}

// Delete a key and return whether successful
function deleteLink(new_key) {
	const foundIndex = config.links.findIndex((l) => (
		l.key.toLowerCase().trim() === new_key.toLowerCase().trim()
	));

	if (foundIndex == -1) {
		error_text = "Link key not found; please provide the full name";
		return false;
	} else {
		config.links.splice(foundIndex, 1);
	}
	saveConfig();
	return true;
}

function parseSetArguments(arguments_string) {
	let key_value = "";
	let href_value = "";
	let foundSpace = false;
	for (let i = arguments_string.length - 1; i >= 0; i--) {
		const thischar = arguments_string.substring(i, i + 1);
		if (foundSpace) key_value = thischar + key_value;
		else if (thischar == ' ') foundSpace = true;
		else href_value = thischar + href_value;
	}
	key_value = key_value.trim();
	href_value = href_value.trim();

	return { key_value, href_value };
}

function populateTemplate(templateString, args) {
	let res = "";
	// Regex matches "{0}".
	// No need to worry about escaping literal { and } as they are not used in URLs (would be encoded)
	let regex = /{\d+}/;
	while (templateString.search(regex) != -1) {
		const currIndex = templateString.search(regex);
		let argNum = 0;
		let i = currIndex + 1;
		while (templateString[i] >= '0' && templateString[i] <= '9') {
			argNum *= 10;
			argNum += templateString.charCodeAt(i) - '0'.charCodeAt(0);
			i += 1;
		}
		// Build next part of string
		res += templateString.substring(0, currIndex);
		if (argNum >= args.length || argNum < 0) {
			error_text = `Argument #${argNum} is required but not provided`;
			return false;
		}
		res += args[argNum];
		templateString = templateString.substring(i + 1);
	}
	res += templateString;

	return res;
}

// Process entered input and return whether successful
function processInput(new_value) {
	// Determine type by first character
	if (new_value.startsWith(":")) {
		// Command
		if (new_value == ":show") {
			config.display_when_empty = true;
			saveConfig();
		} else if (new_value == ":hide") {
			config.display_when_empty = false;
			saveConfig();
		} else if (new_value.startsWith(":clockmode")) {
			const mode = new_value.substring(10).trim().toLowerCase();
			if (mode === "24" || mode === "24h") {
				config.clock_use_24h = true;
			} else if (mode === "12" || mode === "12h") {
				config.clock_use_24h = false;
			} else {
				error_text = "Usage: :clockmode {12|24}";
				return false;
			}
			saveConfig();
			updateClock();
			return true;
		} else if (new_value.startsWith(":showseconds")) {
			const value = new_value.substring(12).trim().toLowerCase();
			if (value === "") {
				config.clock_show_seconds = !config.clock_show_seconds;
			} else if (value === "true") {
				config.clock_show_seconds = true;
			} else if (value === "false") {
				config.clock_show_seconds = false;
			} else {
				error_text = "Usage: :showseconds {true|false}";
				return false;
			}
			saveConfig();
			updateClock();
			return true;
		} else if (new_value.startsWith(":delete")) {
			// Delete
			return deleteLink(new_value.substring(7).trim());
		} else if (new_value.startsWith(":set")) {
			// Set
			// Parse to find arguments
			const arguments_string = new_value.substring(4).trim();
			const parsed = parseSetArguments(arguments_string);
			return setLink(parsed.key_value, parsed.href_value);
		} else if (new_value.startsWith(":export")) {
			// Export as a .json file
			exportFile();
			return true;
		} else if (new_value.startsWith(":import")) {
			// Import from a .json file
			// Activate file select
			document.getElementById("file-uploader").click();
			return true;
		} else if (new_value.startsWith(":resetconfig")) {
			config = structuredClone(CONFIG_DEFAULT);
			saveConfig();
			return true;
		} else if (new_value.startsWith(":help")) {
			// Tell to read the README.md
			error_text = 'For help, check the included README.md file'
			return true;
		} else {
			// Not a command
			error_text = "Not a command";
			return false;
		}
		return true;
	} else if (new_value.startsWith("=")) {
		// Go to the address
		if (new_value.substring(1).startsWith("http")) window.location.href = new_value.substring(1).trim();
		else window.location.href = "https://" + new_value.substring(1).trim();
	} else if (new_value.startsWith("-")) {
		// Web search
		window.location.href = `${config.search_url_prefix}?q=${new_value.substring(1).trim()}`;
	} else if (new_value.startsWith("+")) {
		// Custom template
		const parsed = new_value.substring(1).trim().split(" ");
		const template = config.templates[parsed[0]];
		if (!template) {
			error_text = "Not a template id";
			return false;
		}

		const res = populateTemplate(template, parsed.slice(1));
		if (typeof res === 'string') {
			location.href = res;
			return true;
		} else {
			return false;
		}
	} else {
		// Link: choose the selected one of the filtered
		if (links_filtered.length == 0) {
			// Cannot do anything
			error_text = "No matching links (did you mean to use a :command?)";
			return false;
		} else {
			// Go to the link
			if (selectedi < 0) selectedi = 0;
			else if (selectedi >= links_filtered.length) selectedi = links_filtered.length - 1;
			window.location.href = links_filtered[selectedi].href;
			return true;
		}
	}
}

// Compare two links
function compareLinks(a, b) {
	if (a?.priority > b?.priority) return -1;
	else if (a?.priority < b?.priority) return 1;

	if (a.key < b.key) return -1;
	else if (a.key > b.key) return 1;
	else return 0;
}

// Sort links alphabetically
function sortLinks() {
	config.links.sort(compareLinks);
	links_filtered.sort(compareLinks);
}

// Update the filter based on the new search query
const helptext = document.getElementById("helptext");
function updateFiltered(new_value) {
	helptext.className = "normal";
	helptext.innerText = "";
	// Based on the contents of the box
	const trimmed = new_value.trim().toLowerCase();
	let shouldFilter = true;
	let filterTo = trimmed;
	if (trimmed == "") {
		// Empty: show or hide, based on the setting
		if (config.display_when_empty) {
			links_filtered = config.links.map(link => ({ ...link, priority: 0 }));
		} else {
			links_filtered = [];
		}
		shouldFilter = false;
	} else if (trimmed.startsWith(":set") || trimmed.startsWith(":delete")) {
		// Command: trim and filter for some commands (ex. :set and :delete)
		filterTo = "";
		let foundSpace = false;
		for (let i = 0; i < trimmed.length; i++) {
			if (trimmed[i] == ' ' && !foundSpace) { foundSpace = true; }
			else if (foundSpace) { filterTo += trimmed[i]; }
		}
		shouldFilter = true;
		// Update help text
		if (trimmed.startsWith(":set")) {
			helptext.innerText = ":set {display name} {full URL}";
		} else if (trimmed.startsWith(":delete")) {
			helptext.innerText = ":delete {full name of link to delete}";
		}
	}
	if (shouldFilter) {
		// Not empty: filter
		links_filtered = [];
		for (const link of config.links) {
			// TODO: ignore all spaces for easier search?
			const matchesFilter = link.key.toLowerCase().includes(filterTo);
			if (matchesFilter) {
				links_filtered.push({ ...link, priority: 0 });
				if (link.key.toLowerCase().startsWith(filterTo)) {
					// First priority: starts with
					links_filtered[links_filtered.length - 1].priority = 1;
				}
			}
		}
	}
	sortLinks();
	// Add help text if needed
	if (error_text.length > 0) {
		helptext.className = "error";
		helptext.innerText = error_text;
	} else if (new_value.startsWith(":clockmode")) {
		helptext.className = "normal";
		helptext.innerText = "Set clock format (ex. :clockmode 12 or :clockmode 24)";
	} else if (new_value.startsWith(":showseconds")) {
		helptext.className = "normal";
		helptext.innerText = "Toggle or set seconds (ex. :showseconds, :showseconds true, :showseconds false)";
	} else if (new_value.startsWith(":") && helptext.innerText == "") {
		helptext.className = "normal";
		helptext.innerText = "Enter a command (ex. :set, :delete)";
	} else if (new_value.startsWith("=")) {
		helptext.className = "normal";
		helptext.innerText = "Enter an address (ex. =example.com)";
	} else if (new_value.startsWith("-")) {
		helptext.className = "normal";
		helptext.innerText = "Enter a web search (ex. -marsupials)";
	} else if (new_value.startsWith("+")) {
		helptext.className = "normal";
		helptext.innerText = "Enter your custom command (ex. +mycommand arg1 arg2)";
	}
	// Handle selection
	if (selectedi >= links_filtered.length) selectedi = links_filtered.length - 1;
}

// Export to a file
function exportFile() {
	// Simply export the config as a prettified JSON
	const text = JSON.stringify(config, null, 4);
	// Download the config
	const elem = document.createElement("a");
	elem.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
	elem.setAttribute("download", "homepage_omni_config.json");
	elem.style.display = "none";
	document.body.appendChild(elem);
	elem.click();
	document.body.removeChild(elem);
}

// Import from raw text (the .json format that is exported)
function importFromString(theText) {
	// Simply parse the config from a JSON
	config = JSON.parse(theText);
	// Fill in any missing fields with the defaults using the ES6 spread operator
	config = { ...CONFIG_DEFAULT, ...config };
	// TODO: Do not add a link if the URL or the key do not exist or are invalid (corrupted)
	// Update
	sortLinks();
	updateFiltered("");
	render();
	updateClock();
	updateTheme();
	// Save the links to storage after loading them (assuming no errors)
	// TODO: display result/error if needed?
	saveConfig();
}

// Upload a file
document.getElementById("file-uploader").addEventListener("change", () => {
	// File must exist
	if (document.getElementById("file-uploader").files.length <= 0) return;
	// Try to parse the value
	const file = document.getElementById("file-uploader").files[0];
	const reader = new FileReader();
	reader.addEventListener("load", function() {
		// Loaded the text content
		const textContent = reader.result;
		// Update from the text
		importFromString(textContent);
	});
	reader.readAsText(file);
});

// Render
const omnibar = document.getElementById("omnibar");
const listbox = document.getElementById("listbox");
function render() {
	// Clear the list
	while (listbox.firstChild) {
		listbox.removeChild(listbox.lastChild);
	}
	// Based on the links which have been filtered
	let first_item = true;
	for (let i = 0; i < links_filtered.length; i++) {
		// Render the link
		const new_div = document.createElement("div");
		if (i == selectedi) {
			new_div.className = "linkitem_selected";
		}
		else new_div.className = "linkitem_normal";
		const new_a = document.createElement("a");
		new_a.href = links_filtered[i].href;
		new_a.innerText = links_filtered[i].key;
		new_div.appendChild(new_a);
		listbox.appendChild(new_div);
		first_item = false;
		if (i == selectedi) {
			// Make sure it is visible
			new_div.scrollIntoView();
		}
	}
	// Update the placeholder
	omnibar.placeholder = config.bar_placeholder;
}

function updateTheme() {
	// Update the theme color variables in the html's css to align with the config's theme
	const VALID_THEME_KEYS = ["mainbg", "lightbg", "midbg", "blue", "bluedark"];

	const valid_hex = /#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/;
	for (const [key, val] of Object.entries(config.theme)) {
		const allowed = VALID_THEME_KEYS.includes(key) && valid_hex.test(val);
		if (allowed) {
			document.documentElement.style.setProperty(`--${key}`, val);
		}
	}
}

// On updating
omnibar.addEventListener("change", () => {
	updateFiltered(omnibar.value);
	render();
});
omnibar.addEventListener("keyup", (_e) => {
	updateFiltered(omnibar.value);
	render();
});
omnibar.addEventListener("keydown", (e) => {
	if (e.key === "ArrowUp") {
		// Move selection up
		selectedi--;
		if (selectedi < 0) selectedi = links_filtered.length - 1;
		render();
	} else if (e.key === "ArrowDown") {
		// Move selection down
		selectedi++;
		if (selectedi >= links_filtered.length) selectedi = 0;
		render();
	} else if (e.key === "Enter") {
		const success = processInput(omnibar.value);
		if (success) {
			// Clear the box
			omnibar.value = "";
		}
		updateFiltered(omnibar.value);
	} else {
		error_text = "";
	}
});

// Save config to storage, if possible
async function saveConfig() {
	if (is_chrome) {
		// Use chrome storage
		chrome.storage.local.set({
			"config": config
		});
	} else {
		// Use cross-browser storage
		browser.storage.local.set({
			"config": config
		});
	}
}

// Load config from storage, if possible, and render
async function loadConfig() {
	function useStorageResult(result) {
		if (
			result != null && result != undefined
			&& Object.keys(result).length !== 0
			&& "config" in result
		) {
			config = result["config"];
			// Fill in any missing fields
			config = { ...CONFIG_DEFAULT, ...config };
			sortLinks();
			updateFiltered("");
			render();
			updateClock();
			updateTheme();
		}
	}

	if (is_chrome) {
		// Use chrome storage
		// TODO: test more in chrome
		chrome.storage.local.get(["config"], (result) => {
			useStorageResult(result);
		});
	} else {
		// Use cross-browser storage
		const result = await browser.storage.local.get(["config"]);
		useStorageResult(result);
	}
}

// Time and date utilities
const weekdays = ["Sun.", "Mon.", "Tues.", "Wed.", "Thurs.", "Fri.", "Sat."];
const weekdaysChar = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
function padTime(time) {
	let res = "" + time;
	if (res.length < 2) res = "0" + res;
	return res;
}

// Render a specific clock given its ID, a date, a region name, and whether to use UTC (for global clocks)
function renderClock(clockid, d, region, useUTC) {
	const hours24 = useUTC ? d.getUTCHours() : d.getHours();
	const minutes = useUTC ? d.getUTCMinutes() : d.getMinutes();
	const seconds = useUTC ? d.getUTCSeconds() : d.getSeconds();
	const fullYear = useUTC ? d.getUTCFullYear() : d.getFullYear();
	const month = useUTC ? d.getUTCMonth() : d.getMonth();
	const date = useUTC ? d.getUTCDate() : d.getDate();
	const day = useUTC ? d.getUTCDay() : d.getDay();
	const use24Hour = config.clock_use_24h !== false;
	const showSeconds = config.clock_show_seconds === true;

	let timeRender = "";
	if (use24Hour) {
		timeRender = `${padTime(hours24)}:${padTime(minutes)}`;
		if (showSeconds) {
			timeRender += `:${padTime(seconds)}`;
		}
	} else {
		let hours12 = hours24 % 12;
		if (hours12 == 0) hours12 = 12;
		const ampm = hours24 >= 12 ? "PM" : "AM";
		timeRender = `${hours12}:${padTime(minutes)}`;
		if (showSeconds) {
			timeRender += `:${padTime(seconds)}`;
		}
		timeRender += ` ${ampm}`;
	}

	const dateRender = `${fullYear}/${padTime(month + 1)}/${padTime(date)} - ${weekdays[day]}`;

	document.getElementById("clockitem" + clockid).style.display = "inline";
	document.getElementById("clocktext" + clockid).innerText = timeRender;
	document.getElementById("datetext" + clockid).innerText = dateRender;
	document.getElementById("regiontext" + clockid).innerText = region;
}

// Update clock and time
const eventbox = document.getElementById("eventbox");
const clockItem1 = document.getElementById("clockitem1");
const clockItem2 = document.getElementById("clockitem2");
const clockItem3 = document.getElementById("clockitem3");
function updateClock() {
	// Current time and date
	const d = new Date();
	const currHr = d.getHours();
	const currMin = d.getMinutes();
	const currSec = d.getSeconds();
	const currWeekday = d.getDay();
	const currWeekdayChar = weekdaysChar[currWeekday];
	// Display all clocks
	if (config.clock1_name == "hidden") {
		clockItem1.style.display = "none";
	} else {
		renderClock("1", d, config.clock1_name, false);
	}
	if (config.clock2_name == "hidden") {
		clockItem2.style.display = "none";
	} else {
		const d2 = new Date(new Date().getTime() + config.clock2_utc_offset * 3600 * 1000);
		renderClock("2", d2, config.clock2_name, true);
	}
	if (config.clock3_name == "hidden") {
		clockItem3.style.display = "none";
	} else {
		const d3 = new Date(new Date().getTime() + config.clock3_utc_offset * 3600 * 1000);
		renderClock("3", d3, config.clock3_name, true);
	}
	// Events timers
	while (eventbox.firstChild) {
		eventbox.removeChild(eventbox.lastChild);
	}
	for (ev of config.events) {
		// { name, hr, min }
		if (("rep" in ev) && !(ev.rep.includes(currWeekdayChar))) {
			// Not the right weekday
			// TODO: test more
			continue;
		}
		const totalDiffMin = (ev.hr * 60 + ev.min) - (currHr * 60 + currMin + 1);
		const diffHr = Math.floor(totalDiffMin / 60);
		const diffMin = totalDiffMin % 60;
		const diffSec = 60 - currSec;
		if (totalDiffMin < config.event_display_duration_mins && totalDiffMin >= 0) {
			const evdisp = document.createElement("span");
			evdisp.className = "event";
			if (diffHr == 0) {
				evdisp.innerText = `${ev.name} in ${padTime(diffMin)} min ${padTime(diffSec)} sec`;
			} else {
				evdisp.innerText = `${ev.name} in ${padTime(diffHr)} hr ${padTime(diffMin)} min ${padTime(diffSec)} sec`;
			}
			eventbox.appendChild(evdisp);
			const newbr = document.createElement("br");
			eventbox.appendChild(newbr);
		}
	}
}

// Update each second (only if the page is visible)
setInterval(() => {
	if (!document.hidden) {
		updateClock();
	}
}, 1000);

// First time loading the page
sortLinks();
updateFiltered("");
render();
updateClock();
// Load config from storage, if possible
loadConfig();
