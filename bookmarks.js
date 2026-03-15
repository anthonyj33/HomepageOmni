function validateBookmarkPrefix(prefixArgument) {
    if (prefixArgument.length === 0) {
        return {
            valid: false,
            message: 'Omni prefix is required'
        };
    }
	if (prefixArgument.includes(" ")) {
		return {
			valid: false,
			message: `Omni prefix cannot contain spaces`
		};
	}
	if (native_bookmark_prefixes.includes(prefixArgument)) {
		return {
			valid: false,
			message: `Cannot use any existing bookmark prefixes: ${native_bookmark_prefixes.reduce((a, b) => a + ", " + b)}`
		};
	}
	return {
		valid: true,
		value: prefixArgument
	};
}

async function recreateBookmark(title, url) {
	const existing = await extension_api.bookmarks.search(title);
	for (const bookmark of existing) {
		if (bookmark.title === title && typeof bookmark.url === "string") {
			await extension_api.bookmarks.remove(bookmark.id);
		}
	}
	const folderId = await ensureBookmarkFolder();
	await extension_api.bookmarks.create({
		parentId: folderId,
		title,
		url
	});
}

async function ensureBookmarkFolder() {
	const existing = await extension_api.bookmarks.search("Homepage Omni");
	for (const bookmark of existing) {
		if (bookmark.title === "Homepage Omni" && typeof bookmark.url !== "string") {
			return bookmark.id;
		}
	}

	const folder = await extension_api.bookmarks.create({
		title: "Homepage Omni"
	});
	return folder.id;
}
async function createBookmarkShortcuts(rawPrefixArgument) {
    if (is_chrome || !extension_api?.runtime?.getURL) {
		error_text = "Bookmark keywords are only supported in Firefox";
		return false;
	}

    await browser.permissions.request({ permissions: ["bookmarks"] }).catch();
    granted = await browser.permissions.getAll().then((permissions) => {
        if (permissions?.permissions?.includes("bookmarks")) { return true }
        return false;
    });
    if (!granted || !extension_api?.bookmarks?.create) {
        error_text = "Permission to create bookmarks was denied.";
        updateFiltered(omnibar.value);
        return false;
    }


	const trimmedArgument = rawPrefixArgument.trim();
	let omniPrefix = null;
    const validation = validateBookmarkPrefix(trimmedArgument);
    if (!validation.valid) {
        error_text = validation.message;
        return false;
    }
    omniPrefix = validation.value;

	const runtimeUrl = extension_api.runtime.getURL("homepage.html?q=%s");
	const createdPrefixes = [];
	const skippedPrefixes = [];

	for (const prefix of native_bookmark_prefixes) {
		const bookmarkUrl = runtimeUrl.replace("%s", `${encodeURIComponent(prefix)}%s`);
		try {
			await recreateBookmark(`Homepage Omni (${prefix})`, bookmarkUrl);
			createdPrefixes.push(prefix);
		} catch (_error) {
			skippedPrefixes.push(prefix);
		}
	}

	if (trimmedArgument.length > 0) {
		try {
			await recreateBookmark(`Homepage Omni (${omniPrefix})`, runtimeUrl);
			createdPrefixes.push(omniPrefix);
		} catch (_error) {
			skippedPrefixes.push(omniPrefix);
		}
	}

	if (createdPrefixes.length === 0) {
		error_text = "Could not create bookmarks in Firefox.";
		updateFiltered(omnibar.value);
		return false;
	}

	let message = `Bookmarks created in the Homepage Omni folder for: ${createdPrefixes.join(", ")}. Assign Firefox keywords manually in bookmark properties.`;
	if (skippedPrefixes.length > 0) {
		message += `; skipped: ${skippedPrefixes.join(", ")}`;
	}
	error_text = message;
	updateFiltered(omnibar.value);
	return true;
}
