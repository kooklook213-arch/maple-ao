/**
 * ============================================================================
 * Google Apps Script Web App — server-side code for the AI Voicebot Sidebar
 * ============================================================================
 * DEPLOY:
 *   1. Go to https://script.google.com  ->  New project.
 *   2. Paste this file's contents into Code.gs.
 *   3. Deploy -> New deployment -> Type: Web app.
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Copy the /exec URL into portfolio-ai/.env (REACT_APP_GOOGLE_SCRIPT_URL).
 *
 * The sidebar calls it with JSON bodies like:
 *   { action: "createDoc", title, content }        -> { ok, docUrl, editUrl }
 *   { action: "emailProject", to, subject, body }  -> { ok }
 *   { action: "summarizeSlides", deckId }          -> { ok, summary, previewUrls }
 *   { action: "ping" }                             -> { ok: true }
 */

function doPost(e) {
  var data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = {}; }

  var result;
  switch (data.action) {
    case 'createDoc':       result = createDoc(data); break;
    case 'emailProject':    result = emailProject(data); break;
    case 'summarizeSlides': result = summarizeSlides(data); break;
    default:                result = { ok: true, action: data.action || 'none' }; // ping
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'aether-agent' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Creates a Google Doc from markdown-ish text and returns its shareable URLs. */
function createDoc(d) {
  try {
    var doc = DocumentApp.create(d.title || 'AI Project Summary');
    var body = doc.getBody();
    body.appendParagraph(d.title || 'AI Project Summary')
        .setHeading(DocumentApp.ParagraphHeading.TITLE);

    var lines = String(d.content || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^##\s+/.test(line))           body.appendParagraph(line.replace(/^##\s+/, '')).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      else if (/^#\s+/.test(line))       body.appendParagraph(line.replace(/^#\s+/, '')).setHeading(DocumentApp.ParagraphHeading.HEADING1);
      else if (/^\s*[-*]\s+/.test(line)) body.appendListItem(line.replace(/^\s*[-*]\s+/, '')).setGlyphType(DocumentApp.GlyphType.BULLET);
      else                               body.appendParagraph(line);
    }
    doc.saveAndClose();

    DriveApp.getFileById(doc.getId())
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      ok: true,
      docUrl:  'https://docs.google.com/document/d/' + doc.getId() + '/preview',
      editUrl: 'https://docs.google.com/document/d/' + doc.getId() + '/edit'
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Emails project info through the owner's Gmail (authorized by the Apps Script account). */
function emailProject(d) {
  try {
    MailApp.sendEmail({
      to: d.to || Session.getActiveUser().getEmail(),
      subject: d.subject || 'Portfolio Project',
      htmlBody: '<pre style="font-family:Inter,Arial,sans-serif">' + (d.body || '') + '</pre>'
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Fetches slide thumbnails + speaker notes for an embedded deck preview. */
function summarizeSlides(d) {
  try {
    var deck = SlidesApp.openById(d.deckId);
    var pages = deck.getSlides();
    var notes = [], thumbs = [];
    for (var i = 0; i < pages.length; i++) {
      var n = pages[i].getPageSpeakerNotes().getNotes();
      if (n) notes.push('Slide ' + (i + 1) + ': ' + n);
      thumbs.push('https://docs.google.com/presentation/d/' + d.deckId +
                  '/embed?slide=id.' + pages[i].getObjectId());
    }
    return { ok: true, name: deck.getName(), summary: notes.join('\n'), previewUrls: thumbs };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
