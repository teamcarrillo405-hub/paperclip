// =============================================================================
// Avero Enterprise — Google Workspace Add-on
// File: Code.gs
// Description: Sidebar Add-on for Gmail and Google Docs.
//              Communicates with the Avero Enterprise server via UrlFetchApp.
// =============================================================================

// ---------------------------------------------------------------------------
// Configuration — values are set via File > Project Properties > Script Props
// ---------------------------------------------------------------------------
var AVERO_BASE_URL = (PropertiesService.getScriptProperties().getProperty('AVERO_BASE_URL') || 'http://localhost:3100/api');
var AVERO_COMPANY_ID = (PropertiesService.getScriptProperties().getProperty('AVERO_COMPANY_ID') || '');

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
var COLOR_PRIMARY    = '#1a73e8';
var COLOR_SUCCESS    = '#188038';
var COLOR_ERROR      = '#c5221f';
var COLOR_WARNING    = '#f29900';
var COLOR_LIGHT_GRAY = '#f8f9fa';

// =============================================================================
// HOMEPAGE (shown when no context is available)
// =============================================================================

/**
 * Universal homepage card — shown in both Gmail and Docs when Add-on is opened
 * without a specific context trigger.
 *
 * @param {Object} e  Add-on event object
 * @returns {Card}
 */
function onHomepage(e) {
  var companyConfigured = (AVERO_COMPANY_ID !== '');

  var header = CardService.newCardHeader()
    .setTitle('Avero Enterprise')
    .setSubtitle('AI-Powered Workspace Assistant')
    .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/auto_awesome_black_24dp.png')
    .setImageStyle(CardService.ImageStyle.CIRCLE);

  // --- Status section ---
  var statusDecoratedText = CardService.newDecoratedText()
    .setText('Connected to Avero Enterprise')
    .setStartIcon(
      CardService.newIconImage()
        .setIconUrl('https://www.gstatic.com/images/icons/material/system/2x/check_circle_black_24dp.png')
    );

  var serverUrlText = CardService.newDecoratedText()
    .setTopLabel('Server URL')
    .setText(AVERO_BASE_URL);

  var dashboardAction = CardService.newAction()
    .setFunctionName('openDashboard');

  var dashboardButton = CardService.newTextButton()
    .setText('Open Dashboard')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(dashboardAction);

  var statusSection = CardService.newCardSection()
    .setHeader('Status')
    .addWidget(statusDecoratedText)
    .addWidget(serverUrlText)
    .addWidget(CardService.newButtonSet().addButton(dashboardButton));

  var card = CardService.newCardBuilder()
    .setHeader(header)
    .addSection(statusSection);

  // --- Setup warning if AVERO_COMPANY_ID is missing ---
  if (!companyConfigured) {
    var warningText = CardService.newTextParagraph()
      .setText(
        '<b>Setup Required</b><br><br>' +
        'AVERO_COMPANY_ID is not configured. To finish setup:<br><br>' +
        '1. Open this project in Apps Script (Extensions > Apps Script)<br>' +
        '2. Click the gear icon (Project Settings)<br>' +
        '3. Under "Script Properties" add:<br>' +
        '&nbsp;&nbsp;&bull; <b>AVERO_BASE_URL</b> — your server URL<br>' +
        '&nbsp;&nbsp;&bull; <b>AVERO_COMPANY_ID</b> — your company ID<br>' +
        '4. Save and reload the Add-on'
      );

    var setupSection = CardService.newCardSection()
      .setHeader('Setup Required')
      .addWidget(warningText);

    card.addSection(setupSection);
  }

  // --- Quick-help section ---
  var helpText = CardService.newTextParagraph()
    .setText(
      'Open a Gmail message or Google Doc and click the Avero icon in the ' +
      'sidebar to start using AI features.'
    );

  var helpSection = CardService.newCardSection()
    .setHeader('Getting Started')
    .addWidget(helpText);

  card.addSection(helpSection);

  return card.build();
}

// ---------------------------------------------------------------------------
// Helper: open dashboard in a new browser tab
// ---------------------------------------------------------------------------
function openDashboard() {
  var dashboardUrl = AVERO_BASE_URL.replace('/api', '') + '/dashboard';
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(dashboardUrl)
        .setOpenAs(CardService.OpenAs.FULL_SIZE)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

// =============================================================================
// GMAIL — Contextual trigger
// =============================================================================

/**
 * Fired whenever Gmail opens a message thread.
 * Returns the main Gmail card.
 *
 * @param {Object} e  Gmail add-on event object
 * @returns {Card}
 */
function onGmailMessage(e) {
  var messageId  = e.gmail ? e.gmail.messageId : '';
  var subject    = '';
  var fromHeader = '';

  try {
    if (messageId) {
      var message = GmailApp.getMessageById(messageId);
      subject    = message.getSubject() || '(No Subject)';
      fromHeader = message.getFrom() || '';
    }
  } catch (err) {
    subject = '(Unable to read subject)';
  }

  var header = CardService.newCardHeader()
    .setTitle('Avero AI')
    .setSubtitle(subject ? subject.substring(0, 60) : 'Gmail Assistant')
    .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/auto_awesome_black_24dp.png')
    .setImageStyle(CardService.ImageStyle.CIRCLE);

  // ---- Section 1: Draft a Reply -------------------------------------------
  var instructionsInput = CardService.newTextInput()
    .setFieldName('reply_instructions')
    .setTitle('Instructions')
    .setHint('Reply professionally declining the meeting...')
    .setMultiline(true);

  var generateReplyAction = CardService.newAction()
    .setFunctionName('generateGmailReply')
    .setParameters({ messageId: messageId, subject: subject });

  var generateReplyButton = CardService.newTextButton()
    .setText('Generate Reply')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(generateReplyAction);

  var replySection = CardService.newCardSection()
    .setHeader('Draft a Reply')
    .addWidget(instructionsInput)
    .addWidget(CardService.newButtonSet().addButton(generateReplyButton));

  // ---- Section 2: Create Avero Task ----------------------------------------
  var taskDescInput = CardService.newTextInput()
    .setFieldName('task_description')
    .setTitle('Task description')
    .setValue(subject)
    .setMultiline(false);

  var prioritySelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('task_priority')
    .setTitle('Priority')
    .addItem('Low',    'low',    false)
    .addItem('Medium', 'medium', true)
    .addItem('High',   'high',   false)
    .addItem('Urgent', 'urgent', false);

  var createTaskAction = CardService.newAction()
    .setFunctionName('createTaskFromEmail')
    .setParameters({ messageId: messageId, subject: subject, from: fromHeader });

  var createTaskButton = CardService.newTextButton()
    .setText('Create Task')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_SUCCESS)
    .setOnClickAction(createTaskAction);

  var taskSection = CardService.newCardSection()
    .setHeader('Create Avero Task')
    .addWidget(taskDescInput)
    .addWidget(prioritySelect)
    .addWidget(CardService.newButtonSet().addButton(createTaskButton));

  // ---- Section 3: Quick Actions --------------------------------------------
  var summarizeAction = CardService.newAction()
    .setFunctionName('summarizeThread')
    .setParameters({ messageId: messageId, subject: subject });

  var summarizeButton = CardService.newTextButton()
    .setText('Summarize Thread')
    .setOnClickAction(summarizeAction);

  var quickSection = CardService.newCardSection()
    .setHeader('Quick Actions')
    .addWidget(CardService.newButtonSet().addButton(summarizeButton));

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(replySection)
    .addSection(taskSection)
    .addSection(quickSection)
    .build();
}

// =============================================================================
// GMAIL — Action handlers
// =============================================================================

/**
 * Generates a draft reply using the Avero writing API.
 *
 * @param {Object} e  Action event object (contains formInput and parameters)
 * @returns {ActionResponse}
 */
function generateGmailReply(e) {
  var messageId    = e.parameters.messageId || '';
  var subject      = e.parameters.subject   || '';
  var instructions = (e.formInput && e.formInput.reply_instructions) || '';

  if (!instructions) {
    return buildNotificationResponse('Please enter instructions before generating a reply.');
  }

  var requestBody = {
    companyId:  AVERO_COMPANY_ID,
    topic:      subject,
    docType:    'email',
    userPrompt: instructions
  };

  var result;
  try {
    result = makeAveroRequest('/writing/generate', 'POST', requestBody);
  } catch (err) {
    return buildErrorCard('Failed to generate reply', err.toString(), 'generateGmailReply', e.parameters);
  }

  var generatedContent = extractContent(result);

  // Build result card
  var contentWidget = CardService.newTextParagraph()
    .setText(generatedContent.replace(/\n/g, '<br>'));

  var insertAction = CardService.newAction()
    .setFunctionName('insertGmailReply')
    .setParameters({ messageId: messageId, content: generatedContent });

  var insertButton = CardService.newTextButton()
    .setText('Insert into Gmail Draft')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(insertAction);

  var copyNotifyAction = CardService.newAction()
    .setFunctionName('notifyCopyContent')
    .setParameters({ content: generatedContent });

  var copyButton = CardService.newTextButton()
    .setText('Show Full Text')
    .setOnClickAction(copyNotifyAction);

  var resultSection = CardService.newCardSection()
    .setHeader('Generated Reply')
    .addWidget(contentWidget)
    .addWidget(
      CardService.newButtonSet()
        .addButton(insertButton)
        .addButton(copyButton)
    );

  var resultCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Reply Ready')
        .setSubtitle('Review before sending')
    )
    .addSection(resultSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(resultCard))
    .build();
}

/**
 * Inserts a generated reply as a Gmail draft reply on the thread.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function insertGmailReply(e) {
  var messageId = e.parameters.messageId || '';
  var content   = e.parameters.content   || '';

  try {
    var message = GmailApp.getMessageById(messageId);
    var thread  = message.getThread();
    // Create a draft reply rather than sending immediately
    thread.createDraftReply(content);
    return buildNotificationResponse('Draft reply created in Gmail. Open Gmail to review and send.');
  } catch (err) {
    return buildNotificationResponse('Error creating draft: ' + err.toString());
  }
}

/**
 * Shows a notification prompting the user to manually copy from the card.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function notifyCopyContent() {
  return buildNotificationResponse('Select and copy the text directly from the card above.');
}

/**
 * Creates an Avero task from an email thread.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function createTaskFromEmail(e) {
  var messageId   = e.parameters.messageId || '';
  var subject     = e.parameters.subject   || '';
  var from        = e.parameters.from      || '';
  var description = (e.formInput && e.formInput.task_description) || subject;
  var priority    = (e.formInput && e.formInput.task_priority)    || 'medium';

  // Gather snippet from the email
  var snippet = '';
  try {
    var message = GmailApp.getMessageById(messageId);
    snippet = message.getPlainBody().substring(0, 500);
  } catch (err) {
    snippet = '';
  }

  // Build the task via Avero issues endpoint
  var requestBody = {
    companyId:   AVERO_COMPANY_ID,
    title:       description,
    description: 'From email: ' + from + '\n\n' + snippet,
    priority:    priority,
    source:      'gmail',
    metadata: {
      gmailMessageId: messageId,
      gmailSubject:   subject,
      gmailFrom:      from
    }
  };

  var result;
  try {
    result = makeAveroRequest('/issues', 'POST', requestBody);
  } catch (err) {
    // Fallback: use writing/context if issues endpoint is unavailable
    try {
      result = makeAveroRequest('/writing/context', 'POST', {
        companyId: AVERO_COMPANY_ID,
        context:   description
      });
    } catch (err2) {
      return buildErrorCard('Failed to create task', err.toString(), 'createTaskFromEmail', e.parameters);
    }
  }

  var taskId   = (result && result.id)    ? result.id    : '';
  var taskLink = AVERO_BASE_URL.replace('/api', '') + '/dashboard' + (taskId ? '/issues/' + taskId : '');

  var successText = CardService.newTextParagraph()
    .setText(
      '<b>Task created successfully!</b><br><br>' +
      '<b>Title:</b> ' + description + '<br>' +
      '<b>Priority:</b> ' + priority + '<br>' +
      (taskId ? '<b>ID:</b> ' + taskId : '')
    );

  var openAction = CardService.newAction()
    .setFunctionName('openLink')
    .setParameters({ url: taskLink });

  var openButton = CardService.newTextButton()
    .setText('View in Dashboard')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(openAction);

  var successSection = CardService.newCardSection()
    .addWidget(successText)
    .addWidget(CardService.newButtonSet().addButton(openButton));

  var successCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Task Created')
        .setSubtitle('Avero Enterprise')
    )
    .addSection(successSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(successCard))
    .build();
}

/**
 * Summarizes the entire Gmail thread by collecting messages then calling Avero.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function summarizeThread(e) {
  var messageId = e.parameters.messageId || '';
  var subject   = e.parameters.subject   || '';

  // Build a local text representation of the thread
  var threadText = 'Email Thread: ' + subject + '\n\n';
  try {
    var message = GmailApp.getMessageById(messageId);
    var thread  = message.getThread();
    var messages = thread.getMessages();

    messages.forEach(function(msg, idx) {
      threadText +=
        '--- Message ' + (idx + 1) + ' ---\n' +
        'From: '    + msg.getFrom()    + '\n' +
        'Date: '    + msg.getDate()    + '\n' +
        'Subject: ' + msg.getSubject() + '\n\n' +
        msg.getPlainBody().substring(0, 400) + '\n\n';
    });
  } catch (err) {
    threadText += '(Could not retrieve full thread: ' + err.toString() + ')';
  }

  // Truncate to keep prompt manageable
  if (threadText.length > 4000) {
    threadText = threadText.substring(0, 4000) + '\n\n[Thread truncated...]';
  }

  var requestBody = {
    companyId:  AVERO_COMPANY_ID,
    topic:      subject,
    docType:    'meeting-summary',
    userPrompt: 'Summarize the key points, decisions, and action items from this email thread:\n\n' + threadText
  };

  var result;
  try {
    result = makeAveroRequest('/writing/generate', 'POST', requestBody);
  } catch (err) {
    return buildErrorCard('Failed to summarize thread', err.toString(), 'summarizeThread', e.parameters);
  }

  var summary = extractContent(result);

  var summaryWidget = CardService.newTextParagraph()
    .setText(summary.replace(/\n/g, '<br>'));

  var summarySection = CardService.newCardSection()
    .setHeader('Thread Summary')
    .addWidget(summaryWidget);

  var summaryCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Thread Summary')
        .setSubtitle(subject.substring(0, 60))
    )
    .addSection(summarySection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(summaryCard))
    .build();
}

// =============================================================================
// GOOGLE DOCS — File-scope trigger
// =============================================================================

/**
 * Fired when the user grants file scope for a Google Doc.
 * Returns the Docs assistant card.
 *
 * @param {Object} e  Docs add-on event object
 * @returns {Card}
 */
function onDocOpen(e) {
  var docTitle = '';
  try {
    docTitle = DocumentApp.getActiveDocument().getName() || 'Untitled Document';
  } catch (err) {
    docTitle = 'Document';
  }

  var header = CardService.newCardHeader()
    .setTitle('Avero AI Assistant')
    .setSubtitle(docTitle.substring(0, 60))
    .setImageUrl('https://www.gstatic.com/images/icons/material/system/2x/auto_awesome_black_24dp.png')
    .setImageStyle(CardService.ImageStyle.CIRCLE);

  // ---- Section 1: Expand Selection ----------------------------------------
  var expandInstructions = CardService.newTextParagraph()
    .setText('Select text in your document, then click the button to have Avero AI expand and elaborate on it.');

  var expandAction = CardService.newAction()
    .setFunctionName('expandDocSelection');

  var expandButton = CardService.newTextButton()
    .setText('Expand Selected Text')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(expandAction);

  var expandSection = CardService.newCardSection()
    .setHeader('Expand Selection')
    .addWidget(expandInstructions)
    .addWidget(CardService.newButtonSet().addButton(expandButton));

  // ---- Section 2: Review Document -----------------------------------------
  var reviewInstructions = CardService.newTextParagraph()
    .setText('Get AI feedback on your entire document — gaps, clarity, structure, and actionable improvements.');

  var reviewAction = CardService.newAction()
    .setFunctionName('reviewDocument');

  var reviewButton = CardService.newTextButton()
    .setText('Full Document Review')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_WARNING)
    .setOnClickAction(reviewAction);

  var reviewSection = CardService.newCardSection()
    .setHeader('Review Document')
    .addWidget(reviewInstructions)
    .addWidget(CardService.newButtonSet().addButton(reviewButton));

  // ---- Section 3: Generate Section ----------------------------------------
  var sectionNameInput = CardService.newTextInput()
    .setFieldName('section_name')
    .setTitle('What section to generate?')
    .setHint('Executive Summary, Risk Analysis, Project Timeline...')
    .setMultiline(false);

  var docTypeSelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('doc_type')
    .setTitle('Document Type')
    .addItem('Report',   'report',   true)
    .addItem('Proposal', 'proposal', false)
    .addItem('Memo',     'memo',     false)
    .addItem('Email',    'email',    false);

  var generateSectionAction = CardService.newAction()
    .setFunctionName('generateDocSection');

  var generateSectionButton = CardService.newTextButton()
    .setText('Generate Section')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_SUCCESS)
    .setOnClickAction(generateSectionAction);

  var generateSection = CardService.newCardSection()
    .setHeader('Generate Section')
    .addWidget(sectionNameInput)
    .addWidget(docTypeSelect)
    .addWidget(CardService.newButtonSet().addButton(generateSectionButton));

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(expandSection)
    .addSection(reviewSection)
    .addSection(generateSection)
    .build();
}

// =============================================================================
// GOOGLE DOCS — Action handlers
// =============================================================================

/**
 * Expands the currently selected text in the active Google Doc.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function expandDocSelection(e) {
  var selectedText = '';

  try {
    var doc       = DocumentApp.getActiveDocument();
    var selection = doc.getSelection();

    if (!selection) {
      return buildNotificationResponse('Please select some text in the document first, then try again.');
    }

    var elements = selection.getRangeElements();
    elements.forEach(function(rangeElement) {
      var element = rangeElement.getElement();
      if (element.asText) {
        var text = element.asText();
        if (rangeElement.isPartial()) {
          selectedText += text.getText().substring(
            rangeElement.getStartOffset(),
            rangeElement.getEndOffsetInclusive() + 1
          );
        } else {
          selectedText += text.getText();
        }
        selectedText += ' ';
      }
    });

    selectedText = selectedText.trim();
  } catch (err) {
    return buildNotificationResponse('Could not read selection: ' + err.toString());
  }

  if (!selectedText) {
    return buildNotificationResponse('No text found in selection. Please select some text and try again.');
  }

  if (selectedText.length > 2000) {
    selectedText = selectedText.substring(0, 2000) + '...';
  }

  var requestBody = {
    companyId:  AVERO_COMPANY_ID,
    docType:    'general',
    userPrompt: 'Expand and elaborate on the following text with additional detail, context, and supporting information:\n\n' + selectedText
  };

  var result;
  try {
    result = makeAveroRequest('/writing/generate', 'POST', requestBody);
  } catch (err) {
    return buildErrorCard('Failed to expand selection', err.toString(), 'expandDocSelection', {});
  }

  var expanded = extractContent(result);

  var previewWidget = CardService.newTextParagraph()
    .setText(expanded.substring(0, 800).replace(/\n/g, '<br>') + (expanded.length > 800 ? '<br>...' : ''));

  var insertAction = CardService.newAction()
    .setFunctionName('insertExpandedText')
    .setParameters({ content: expanded });

  var insertButton = CardService.newTextButton()
    .setText('Insert After Selection')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(insertAction);

  var resultSection = CardService.newCardSection()
    .setHeader('Expanded Text')
    .addWidget(previewWidget)
    .addWidget(CardService.newButtonSet().addButton(insertButton));

  var resultCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Expansion Ready')
        .setSubtitle('Review before inserting')
    )
    .addSection(resultSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(resultCard))
    .build();
}

/**
 * Inserts generated/expanded text after the current cursor position.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function insertExpandedText(e) {
  var content = e.parameters.content || '';

  try {
    var doc    = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (cursor) {
      var element  = cursor.getElement();
      var parent   = element.getParent();
      var body     = doc.getBody();
      var index    = body.getChildIndex(parent);
      body.insertParagraph(index + 1, content);
    } else {
      // No cursor — append at end
      doc.getBody().appendParagraph(content);
    }

    return buildNotificationResponse('Text inserted into document successfully.');
  } catch (err) {
    return buildNotificationResponse('Error inserting text: ' + err.toString());
  }
}

/**
 * Reviews the full document body and returns AI feedback.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function reviewDocument(e) {
  var docText = '';

  try {
    docText = DocumentApp.getActiveDocument().getBody().getText();
  } catch (err) {
    return buildNotificationResponse('Could not read document: ' + err.toString());
  }

  if (!docText || docText.trim().length === 0) {
    return buildNotificationResponse('The document appears to be empty. Add some content and try again.');
  }

  // Truncate to 3000 chars to keep request manageable
  var truncated = false;
  if (docText.length > 3000) {
    docText    = docText.substring(0, 3000);
    truncated  = true;
  }

  var requestBody = {
    companyId:  AVERO_COMPANY_ID,
    docType:    'report',
    userPrompt: 'Review this document for gaps, clarity, structure, and improvements. ' +
                'Provide specific, actionable feedback organized by category:\n\n' + docText +
                (truncated ? '\n\n[Note: Document was truncated to 3000 characters for this review.]' : '')
  };

  var result;
  try {
    result = makeAveroRequest('/writing/generate', 'POST', requestBody);
  } catch (err) {
    return buildErrorCard('Failed to review document', err.toString(), 'reviewDocument', {});
  }

  var review = extractContent(result);

  var reviewWidget = CardService.newTextParagraph()
    .setText(review.replace(/\n/g, '<br>'));

  var noteWidget = truncated
    ? CardService.newTextParagraph().setText('<i>Note: Only the first 3,000 characters were reviewed.</i>')
    : null;

  var reviewSection = CardService.newCardSection()
    .setHeader('AI Review Feedback');

  if (noteWidget) {
    reviewSection.addWidget(noteWidget);
  }
  reviewSection.addWidget(reviewWidget);

  var reviewCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Document Review')
        .setSubtitle('Avero AI Feedback')
    )
    .addSection(reviewSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(reviewCard))
    .build();
}

/**
 * Generates a new document section based on user input.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function generateDocSection(e) {
  var sectionName = (e.formInput && e.formInput.section_name) || '';
  var docType     = (e.formInput && e.formInput.doc_type)     || 'report';

  if (!sectionName) {
    return buildNotificationResponse('Please enter a section name before generating.');
  }

  var requestBody = {
    companyId:  AVERO_COMPANY_ID,
    docType:    docType,
    userPrompt: 'Write a complete "' + sectionName + '" section for a professional ' + docType + '. ' +
                'Include all relevant subsections, detailed content, and professional language appropriate for the document type.'
  };

  var result;
  try {
    result = makeAveroRequest('/writing/generate', 'POST', requestBody);
  } catch (err) {
    return buildErrorCard('Failed to generate section', err.toString(), 'generateDocSection', {});
  }

  var generated = extractContent(result);

  var previewWidget = CardService.newTextParagraph()
    .setText(generated.substring(0, 800).replace(/\n/g, '<br>') + (generated.length > 800 ? '<br>...' : ''));

  var insertCursorAction = CardService.newAction()
    .setFunctionName('insertAtCursor')
    .setParameters({ content: generated, sectionName: sectionName });

  var insertButton = CardService.newTextButton()
    .setText('Insert at Cursor')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_PRIMARY)
    .setOnClickAction(insertCursorAction);

  var appendAction = CardService.newAction()
    .setFunctionName('appendToDoc')
    .setParameters({ content: generated, sectionName: sectionName });

  var appendButton = CardService.newTextButton()
    .setText('Append to End')
    .setOnClickAction(appendAction);

  var resultSection = CardService.newCardSection()
    .setHeader('"' + sectionName + '" — Preview')
    .addWidget(previewWidget)
    .addWidget(
      CardService.newButtonSet()
        .addButton(insertButton)
        .addButton(appendButton)
    );

  var resultCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Section Generated')
        .setSubtitle(sectionName.substring(0, 50))
    )
    .addSection(resultSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(resultCard))
    .build();
}

/**
 * Inserts generated content at the current cursor position in the Doc.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function insertAtCursor(e) {
  var content     = e.parameters.content     || '';
  var sectionName = e.parameters.sectionName || '';

  try {
    var doc    = DocumentApp.getActiveDocument();
    var body   = doc.getBody();
    var cursor = doc.getCursor();

    if (cursor) {
      var parent = cursor.getElement().getParent();
      var index  = body.getChildIndex(parent);
      if (sectionName) {
        var heading = body.insertParagraph(index + 1, sectionName);
        heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
        body.insertParagraph(index + 2, content);
      } else {
        body.insertParagraph(index + 1, content);
      }
    } else {
      if (sectionName) {
        var h = body.appendParagraph(sectionName);
        h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      }
      body.appendParagraph(content);
    }

    return buildNotificationResponse('Section "' + (sectionName || 'content') + '" inserted into document.');
  } catch (err) {
    return buildNotificationResponse('Error inserting section: ' + err.toString());
  }
}

/**
 * Appends generated content at the end of the document.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function appendToDoc(e) {
  var content     = e.parameters.content     || '';
  var sectionName = e.parameters.sectionName || '';

  try {
    var doc  = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    if (sectionName) {
      var heading = body.appendParagraph(sectionName);
      heading.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    }
    body.appendParagraph(content);

    return buildNotificationResponse('Section appended to end of document.');
  } catch (err) {
    return buildNotificationResponse('Error appending section: ' + err.toString());
  }
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

/**
 * Generic helper to open a URL link.
 *
 * @param {Object} e
 * @returns {ActionResponse}
 */
function openLink(e) {
  var url = e.parameters.url || AVERO_BASE_URL.replace('/api', '') + '/dashboard';
  return CardService.newActionResponseBuilder()
    .setOpenLink(
      CardService.newOpenLink()
        .setUrl(url)
        .setOpenAs(CardService.OpenAs.FULL_SIZE)
        .setOnClose(CardService.OnClose.NOTHING)
    )
    .build();
}

/**
 * Makes an authenticated HTTP request to the Avero Enterprise API.
 *
 * @param {string} path    API path relative to AVERO_BASE_URL (e.g. '/writing/generate')
 * @param {string} method  HTTP method ('GET', 'POST', 'PUT', 'DELETE')
 * @param {Object} body    Request body object (will be JSON-serialized)
 * @returns {Object}       Parsed JSON response
 * @throws {Error}         If the request fails or returns a non-2xx status
 */
function makeAveroRequest(path, method, body) {
  var url = AVERO_BASE_URL + path;

  var options = {
    method:           method || 'GET',
    contentType:      'application/json',
    muteHttpExceptions: true,
    headers: {
      'X-Avero-Source': 'workspace-addon'
    }
  };

  if (body) {
    options.payload = JSON.stringify(body);
  }

  var response     = UrlFetchApp.fetch(url, options);
  var statusCode   = response.getResponseCode();
  var responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      'Avero API returned HTTP ' + statusCode + ': ' + responseText.substring(0, 300)
    );
  }

  try {
    return JSON.parse(responseText);
  } catch (parseErr) {
    throw new Error('Invalid JSON from Avero API: ' + responseText.substring(0, 200));
  }
}

/**
 * Extracts generated content text from a variety of Avero API response shapes.
 *
 * @param {Object} result  Parsed API response
 * @returns {string}
 */
function extractContent(result) {
  if (!result) return 'No content returned from Avero.';

  // Common response shapes
  if (typeof result.content  === 'string') return result.content;
  if (typeof result.text     === 'string') return result.text;
  if (typeof result.result   === 'string') return result.result;
  if (typeof result.output   === 'string') return result.output;
  if (typeof result.response === 'string') return result.response;
  if (typeof result.data     === 'string') return result.data;
  if (result.data && typeof result.data.content === 'string') return result.data.content;
  if (result.data && typeof result.data.text    === 'string') return result.data.text;

  // Fallback: stringify the whole thing
  return JSON.stringify(result, null, 2);
}

/**
 * Builds a simple ActionResponse that shows a toast notification.
 *
 * @param {string} message  Notification text (max ~200 chars)
 * @returns {ActionResponse}
 */
function buildNotificationResponse(message) {
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification().setText(message)
    )
    .build();
}

/**
 * Builds an error card with a message and a retry button.
 *
 * @param {string} title         Short error title
 * @param {string} detail        Error detail text
 * @param {string} retryFunction Name of the Apps Script function to retry
 * @param {Object} retryParams   Parameters to pass back on retry
 * @returns {ActionResponse}
 */
function buildErrorCard(title, detail, retryFunction, retryParams) {
  var errorText = CardService.newTextParagraph()
    .setText(
      '<b style="color:' + COLOR_ERROR + '">' + title + '</b><br><br>' +
      detail.substring(0, 400)
    );

  var retryAction = CardService.newAction()
    .setFunctionName(retryFunction)
    .setParameters(retryParams || {});

  var retryButton = CardService.newTextButton()
    .setText('Retry')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setBackgroundColor(COLOR_ERROR)
    .setOnClickAction(retryAction);

  var backButton = CardService.newTextButton()
    .setText('Go Back')
    .setOnClickAction(
      CardService.newAction().setFunctionName('navigateBack')
    );

  var errorSection = CardService.newCardSection()
    .addWidget(errorText)
    .addWidget(
      CardService.newButtonSet()
        .addButton(retryButton)
        .addButton(backButton)
    );

  var errorCard = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle('Error')
        .setSubtitle(title)
    )
    .addSection(errorSection)
    .build();

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(errorCard))
    .build();
}

/**
 * Pops the current card from the navigation stack (go back).
 *
 * @returns {ActionResponse}
 */
function navigateBack() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}
