Zotero.Scihub = {
	scihub_url: function() {
		// Set default if not set.
		if(Zotero.Prefs.get('zoteroscihub.scihub_url') === undefined) {
			Zotero.Prefs.set('zoteroscihub.scihub_url', 'https://sci-hub.se/')
		}
		return Zotero.Prefs.get('zoteroscihub.scihub_url')
	},
	automatic_pdf_download: function() {
		// Set default if not set.
		if(Zotero.Prefs.get('zoteroscihub.automatic_pdf_download') === undefined) {
			Zotero.Prefs.set('zoteroscihub.automatic_pdf_download', true)
		}
		return Zotero.Prefs.get('zoteroscihub.automatic_pdf_download')
	},
	init: function() {
		Zotero.Scihub.resetState();
		Zotero.Scihub.scihub_url();
		Zotero.Scihub.automatic_pdf_download();

		// Register the callback in Zotero as an item observer
		var notifierID = Zotero.Notifier.registerObserver(
						Zotero.Scihub.notifierCallback, ['item']);

		// Unregister callback when the window closes (important to avoid a memory leak)
		window.addEventListener('unload', function(e) {
				Zotero.Notifier.unregisterObserver(notifierID);
		}, false);
	},
	notifierCallback: {
		// Adds pdfs when new item is added to zotero.
		notify: function(event, type, ids, extraData) {
			automatic_pdf_download_bool = Zotero.Prefs.get('zoteroscihub.automatic_pdf_download');
	    if(event == "add" && !(automatic_pdf_download_bool === undefined) && automatic_pdf_download_bool == true) {
				suppress_warnings = true;
	      Zotero.Scihub.updateItems(Zotero.Items.get(ids), suppress_warnings);
	    }
	  }
	},
	resetState: function() {
		// Reset state for updating items.
		Zotero.Scihub.current = -1;
		Zotero.Scihub.toUpdate = 0;
		Zotero.Scihub.itemsToUpdate = null;
		Zotero.Scihub.numberOfUpdatedItems = 0;
	},
	updateSelectedEntity: function(libraryId) {
		Zotero.debug('Updating items in entity')
		if (!ZoteroPane.canEdit()) {
			ZoteroPane.displayCannotEditLibraryMessage();
			return;
		}

		var collection = ZoteroPane.getSelectedCollection(false);

		if (collection) {
			Zotero.debug("Updating items in entity: Is a collection == true")
			var items = [];
			collection.getChildItems(false, false).forEach(function (item) {
				items.push(item);
			});
			suppress_warnings = true;
			Zotero.Scihub.updateItems(items, suppress_warnings);
		}
	},
	updateSelectedItems: function() {
		Zotero.debug('Updating Selected items');
		suppress_warnings = false;
		Zotero.Scihub.updateItems(ZoteroPane.getSelectedItems(), suppress_warnings);
	},
	updateAll: function() {
		Zotero.debug('Updating all items in Zotero')
		var items = [];

		// Get all items
		Zotero.Items.getAll()
			.then(function (items) {
				// Once we have all items, make sure it's a regular item.
				// And that the library is editable
				// Then add that item to our list.
				items.map(function(item) {
					if (item.isRegularItem() && !item.isCollection()) {
						var libraryId = item.getField('libraryID');
						if (libraryId == null ||
								libraryId == '' ||
								Zotero.Libraries.isEditable(libraryId)) {
									items.push(item);
						}
					}
				});
			});

		// Update all of our items with pdfs.
		suppress_warnings = true;
		Zotero.Scihub.updateItems(items, suppress_warnings);
	},
	updateItems: function(items, suppress_warnings) {
		// If we don't have any items to update, just return.
		if (items.length == 0 ||
				Zotero.Scihub.numberOfUpdatedItems < Zotero.Scihub.toUpdate) {
				return;
		}

		// Reset our state and figure out how many items we have to update.
		Zotero.Scihub.resetState();
		Zotero.Scihub.toUpdate = items.length;
		Zotero.Scihub.itemsToUpdate = items;
		// Iterate through our items, updating each one with a pdf.
		Zotero.Scihub.updateNextItem(suppress_warnings);
	},
	updateNextItem: function(suppress_warnings) {
		Zotero.Scihub.numberOfUpdatedItems++;

		// If we have updated all of our items, reset our state and return.
		if (Zotero.Scihub.current == Zotero.Scihub.toUpdate - 1) {
				Zotero.Scihub.resetState();
				return;
		}

		// Update a single item with a pdf.
		Zotero.Scihub.current++;
		Zotero.Scihub.updateItem(
						Zotero.Scihub.itemsToUpdate[Zotero.Scihub.current],
						suppress_warnings
		);
	},
	generateItemUrl: function(item) {
		var baseURL = Zotero.Prefs.get('zoteroscihub.scihub_url')
		var DOI = item.getField('DOI');
		var url = "";
		if(DOI && (typeof DOI == 'string') && DOI.length > 0) {
			url = baseURL+'/'+DOI;
		}

		// If not using sci-hub.tw ssl is disabled due to invalid certs.
		if(!baseURL.includes("sci-hub.se")) {
			url = url.replace('https', 'http')
		}

		return url;
	},
	fixPdfUrl: function(pdf_url) {
		let prepend = "http"
		// Check if user preferred url is using https. If so, prepend/replace https.
		// If not prepend/replace http.
		scihub_url = Zotero.Prefs.get('zoteroscihub.scihub_url')
		if(scihub_url.includes("sci-hub.se")) {
			prepend = "https"
		}

		// Handle error on Scihub where https/http is not prepended to url
		if(pdf_url.slice(0, 2) == "//") {
			pdf_url = prepend + ":" + pdf_url
		}

		// Make sure all scihub urls use https/http and not http.
		if(pdf_url.slice(0, 5) != "https") {
			pdf_url = prepend + pdf_url.slice(4)
		}

		// If not using sci-hub.tw ssl is disabled due to invalid certs.
		if(!scihub_url.includes("sci-hub.se")) {
			pdf_url = pdf_url.replace('https', 'http')
		}

		return pdf_url;
	},
	updateItem: function(item, suppress_warnings) {
		Zotero.debug("Suppress: " + suppress_warnings)
		var url2 = Zotero.Scihub.generateItemUrl(item);
		var pdf_url = "";
		var req = new XMLHttpRequest();
		var url = url2.replace(".tw",".se");

		Zotero.debug('Opening ' + url);
		if(url != "") {
			req.open('GET', url, true);
			req.onreadystatechange = function() {
				if (req.readyState == 4) {
					if (req.status == 200 && req.responseText.search("captcha") == -1) {
						if (item.isRegularItem() && !item.isCollection()) {
							try {
								// Extract direct pdf url from scihub webpage.
								var html_text = req.responseText
								html_text = html_text.replace(/\s/g, "")
								var split_html = html_text.split('<iframe src="');
								if (split_html.length == 1) {
									split_html = html_text.split('<iframesrc="')
								}
								pdf_url = split_html[1].split('"')[0]
								pdf_url = Zotero.Scihub.fixPdfUrl(pdf_url);

								// Extract PDF name.
								var split_url = pdf_url.split('/');
								var fileBaseName = split_url[split_url.length-1].split('.pdf')[0]
							} catch(e) {
								Zotero.debug("Error parsing webpage 1" + e)
							}

							try {
								// Download PDF and add as attachment.
								var import_options = {
									libraryID: item.libraryID,
									url: pdf_url,
									parentItemID: item.id,
									title: item.getField('title'),
									fileBaseName: fileBaseName,
									contentType: 'application/pdf',
									referrer: '',
									cookieSandbox: null
								};
								Zotero.debug("Import Options: " + JSON.stringify(import_options, null, "\t"));
								Zotero.Attachments.importFromURL(import_options)
									.then(function(result) {
										Zotero.debug("Import result: " + JSON.stringify(result))
									})
									.catch(function(error) {
										Zotero.debug("Import error: " + error)
										// See the following code, if Scihub throws a captcha then our import will throw this error.
										// https://github.com/zotero/zotero/blob/26056c87f1d0b31dc56981adaabcab8fc2f85294/chrome/content/zotero/xpcom/attachments.js#L863
										// If a PDF link shows a captcha, pop up a new browser window to enter the captcha.
										Zotero.debug("Scihub is asking for captcha for: " + pdf_url);
										alert('Please enter the Captcha on the page that will now open and then re-try updating the PDFs, or wait a while to get unblocked by Scihub if the Captcha is not present.');
										req2 = new XMLHttpRequest();
										req2.open('GET', pdf_url, true);
										req2.onreadystatechange = function() {
										 if (req2.readyState == 4) {
											 if (typeof Zotero.launchURL !== 'undefined') {
												 Zotero.launchURL(pdf_url);
											 } else if (typeof Zotero.openInViewer !== 'undefined') {
												 Zotero.openInViewer(pdf_url);
											 } else if (typeof ZoteroStandalone !== 'undefined') {
												 ZoteroStandalone.openInViewer(pdf_url);
											 } else {
												 window.gBrowser.loadOneTab(pdf_url, {inBackground: false});
											 }
											 Zotero.Scihub.resetState();
										 }
										}
										req2.send(null);
									});
							} catch(e) {
								Zotero.debug("Error creating attachment: " + e)
							}
						}
						Zotero.Scihub.updateNextItem();
					} else if (req.status == 200 || req.status == 403 || req.status == 503) {
						// If too many requests were made.. pop up a new browser window to
						// allow user to enter in captcha for scihub.
						Zotero.debug('Scihub is asking for captcha for: ' + url);
						alert(Zotero.Scihub.captchaString);
						req2 = new XMLHttpRequest();
						req2.open('GET', url, true);
						req2.onreadystatechange = function() {
							if (req2.readyState == 4) {
								if (typeof Zotero.launchURL !== 'undefined') {
									Zotero.launchURL(url);
								} else if (typeof Zotero.openInViewer !== 'undefined') {
									Zotero.openInViewer(url);
								} else if (typeof ZoteroStandalone !== 'undefined') {
									ZoteroStandalone.openInViewer(url);
								} else {
									window.gBrowser.loadOneTab(url, {inBackground: false});
								}
								Zotero.Scihub.resetState();
							}
						}
						req2.send(null);
					}
				}
			};
			req.send(null);
		} else if(!(suppress_warnings === undefined) && suppress_warnings == false){
			alert("To be able to fetch a PDF your library item must currently have a DOI")
		}

	}
};

window.addEventListener('load', function(e) {
  Zotero.Scihub.init();
}, false);
