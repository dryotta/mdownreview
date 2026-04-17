## ADDED Requirements

### Requirement: Add a line comment
The application SHALL allow the user to attach a review comment to a specific line of an open document by clicking a comment affordance (e.g., a `+` icon or gutter indicator) that appears on hover next to each line. The comment SHALL be associated with the line number and the file path.

#### Scenario: Hover reveals comment affordance
- **WHEN** the user hovers the mouse over a line in the document viewer
- **THEN** a comment icon appears in the left gutter or margin of that line

#### Scenario: Open comment input
- **WHEN** the user clicks the comment icon on a line
- **THEN** a comment input area appears inline below that line, ready for text entry

#### Scenario: Submit comment
- **WHEN** the user types text into the comment input and submits it (via a "Save" button or `Ctrl+Enter`)
- **THEN** the comment is saved, the input closes, and a comment indicator is shown in the gutter for that line

#### Scenario: Cancel comment
- **WHEN** the user presses Escape or clicks "Cancel" in the comment input
- **THEN** the input closes without saving and no comment is created

### Requirement: View existing comments
The application SHALL display comment indicators in the document gutter for all lines that have associated comments. Clicking a comment indicator SHALL reveal the comment content inline.

#### Scenario: Gutter indicator for commented lines
- **WHEN** a document is opened that has saved comments
- **THEN** comment indicators (e.g., icons or count badges) appear in the gutter at the appropriate lines

#### Scenario: Expand comment inline
- **WHEN** the user clicks a comment indicator in the gutter
- **THEN** the comment(s) for that line expand inline below the line, showing the comment text and timestamp

#### Scenario: Collapse comment
- **WHEN** the user clicks the expanded comment block
- **THEN** the comment collapses back to the gutter indicator

### Requirement: Edit and delete comments
The application SHALL allow the user to edit or delete an existing comment. Editing SHALL replace the comment text in-place. Deletion SHALL remove the comment and its gutter indicator.

#### Scenario: Edit comment
- **WHEN** the user clicks "Edit" on an expanded comment
- **THEN** the comment text becomes editable, and saving replaces the old text with the new text

#### Scenario: Delete comment
- **WHEN** the user clicks "Delete" on an expanded comment
- **THEN** the comment is removed and the gutter indicator disappears (if no other comments remain on that line)

### Requirement: Comments panel
The application SHALL provide a right-side comments panel that lists all comments for the currently active document in order of line number. Clicking a comment in the panel SHALL scroll the document to the corresponding line and expand the comment inline.

#### Scenario: Panel lists all comments
- **WHEN** the comments panel is open and a document with comments is active
- **THEN** all comments for that document are listed in the panel in ascending line order, showing line number, a preview of the text, and timestamp

#### Scenario: Click comment in panel scrolls to line
- **WHEN** the user clicks a comment entry in the comments panel
- **THEN** the document scrolls to bring the commented line into view and the comment expands inline

#### Scenario: Empty state
- **WHEN** the active document has no comments
- **THEN** the comments panel shows a message: "No comments yet"

### Requirement: Toggle comments panel
The application SHALL allow the user to show or hide the comments panel via a toolbar button or keyboard shortcut (`Ctrl+Shift+C` / `Cmd+Shift+C`).

#### Scenario: Hide comments panel
- **WHEN** the comments panel is visible and the user presses the toggle
- **THEN** the panel hides and the viewer expands to fill the space

#### Scenario: Show comments panel
- **WHEN** the comments panel is hidden and the user presses the toggle
- **THEN** the panel reappears

### Requirement: Comment persistence
The application SHALL persist comments to a sidecar file (`<filename>.review.json`) in the same directory as the reviewed document. Comments SHALL survive application restarts.

#### Scenario: Comments saved to sidecar file
- **WHEN** the user saves a comment
- **THEN** a `<filename>.review.json` file is created (or updated) in the same directory as the document

#### Scenario: Comments loaded on open
- **WHEN** the user opens a file that has an associated `.review.json` sidecar file
- **THEN** the saved comments are loaded and displayed in the gutter and comments panel

#### Scenario: No sidecar when no comments
- **WHEN** a document is opened but no comments are added
- **THEN** no `.review.json` file is created

### Requirement: Comment count badge on tab
The application SHALL display a badge on the document tab showing the number of comments for that document when comments are present.

#### Scenario: Tab badge shows count
- **WHEN** a document has one or more saved comments
- **THEN** the tab label shows a numeric badge with the comment count

#### Scenario: Badge disappears when all deleted
- **WHEN** all comments on a document are deleted
- **THEN** the badge is removed from the tab label
