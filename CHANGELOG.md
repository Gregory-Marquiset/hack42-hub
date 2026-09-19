All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ✨(search) Jump to a message found via search that is a thread reply:
  land on its thread in the conversation, open the thread panel and flash
  the reply there.
- ✨(notifications) Show and edit Matrix notification rules from a new
  settings panel (who gets notified, where, and how), mute a whole
  conversation from its header menu or thread panel, and stop showing
  browser notifications/sound for muted conversations.
- ✨(meetings) List a Docs document with a meeting, or create an empty one
  from the Hub, as any member of the conversation. The form recalls that a
  link alone opens for nobody: the document has to be shared in Docs.
- ✨(meetings) Join a meeting from the message Ariane sends about it: her
  message carries the meeting, and the Hub turns it into a button opening the
  call in its own window. Starting a call closes the meetings panel.
- ✨(meetings) Name the espace of the conversation in the messages Ariane
  sends about a meeting, and turn the web addresses of a message into links,
  so the invitation to a call is joined in one click.
- ✨(meetings) Open the whiteboard for every participant at once, and name
  them on it: opening or closing the board is part of the meeting, and each
  cursor carries its owner name instead of a random one.
- ✨(frontend) Show an espace's own avatar on the rail, falling back to its
  initials, and move the brand to the panel's corner above the rail.
- ♻️(frontend) Rebuild the side panel around three fixed lists - Favourites,
  Rooms, Direct messages - each showing its five most recent, with a "see all"
  that gives it the whole panel and a scrollbar, and the espaces on a rail
  down the left edge as the single place that chooses where they come from.
- ✨(frontend) Count what is unread inside each espace on its bubble, and the
  total on the "everything" one, capped at `99+`.
- ✨(frontend) Hold availability at busy and withhold notification sounds while
  a call is in progress, without writing the state the person chose - so
  leaving a call needs nothing undone.
- ✨(frontend) Mark a room whose call is in progress with a camera in the
  corner of its avatar, so the conversation list says it without being opened.
- 🌐(frontend) Translate the rest of the interface into French: the composer,
  message actions, search states and every error message a person is likely to
  meet. No key falls back to its English source any more.
- ✨(frontend) Tell the three presence states apart: green for available, red
  for busy, grey for disconnected. Busy is chosen rather than inferred and
  withholds the notification sound, which going idle never does.
- 🐛(frontend) Stop a newly created espace from hiding every room outside it:
  none is active until one is picked, the switcher carries an "everything"
  entry, and a salon no longer has to belong to an espace.
- 💄(profiles) Give every role label its own colour instead of one grey for
  everything but PO, PM and DEV: six hues sixty degrees apart, with a custom
  title taking a stable hue from its own text.
- ✨(bots) Have Ariane answer in a thread hanging off the message that asked,
  rather than in the room: a room where several people ask her things no longer
  buries its own conversation under her replies.
- ✨(frontend) Say why Ariane cannot be mentioned in an encrypted room instead
  of offering an empty suggestion list, which read as a bug rather than a rule.
- 🐛(frontend) Show the availability dot for someone who has been offline for
  a while: `/sync` never repeated their presence, so the row could not tell
  "offline" from "not known" and showed nothing.
- 💄(frontend) Replace the SDK's multi-line decryption diagnostic with a short
  tombstone - a padlock and one line - for a message this device holds no key
  for, and skip those events in the conversation list preview.
- ✨(frontend) Offer the encryption choice when a salon is created from the
  left panel, not only from New Chat - Matrix has no way back, so a choice
  missing at creation is lost for good. A clear salon created this way also
  invites Ariane, as one created anywhere else does.
- ✨(meetings) Show on the meeting icon of a conversation when a meeting
  starts within 15 minutes or is in progress, and let Ariane tell every
  member in a private message when a meeting is scheduled, starts and ends.
- ✨(meetings) Show the invitation link of a call, in the meeting window and
  the meetings panel, to invite people from outside the conversation.
- ✨(frontend) Share documents from the device in the Documents tab of a
  conversation with its "+" button, list them and download them. They are
  encrypted in the browser when the conversation is.
- ✨(meetings) Put the whiteboard in the archive of a closed meeting: the Hub
  reads the board back from its scene store when the meeting closes, as an
  `.excalidraw` file (`MEETING_BOARD_SCENES_URL`). The archive is named after
  the meeting, its conversation, and the day and time it started.
- ✨(meetings) Show a scheduled meeting in the meetings panel, with its
  invitation link, its agenda and documents, and let every member add files
  from their device until it closes; they go in the archive. A new call
  opens with its invitation link, a scheduled one on this view.
- ✨(frontend) Open a whiteboard next to the call in the meeting window. The
  Excalidraw room is derived from the meeting, so every participant lands on
  the same board, and it is self-hosted alongside its collaboration server
  (`MEETING_BOARD_BASE_URL`); without that setting the call is shown alone.
- ✨(frontend) Let anyone bring Ariane into a room by mentioning her. She is
  offered by `@` in every clear group room, member or not; addressing her in a
  room she has not joined invites her first, she accepts at once and answers.
  She still reads the room only from her arrival on. Never in an encrypted
  room, nor in a conversation between two people.
- ✨(frontend) Give the assistant a face. Wherever a person's avatar appears -
  message bubbles, people search, thread list, and the header, list and search
  rows of a conversation with her - Ariane shows a small robot on one fixed
  colour instead of an initial, so she is told apart from a person at a glance.
  The members list, drawn by the UI kit, is the one exception.
- 🔒️(profiles) Stop sending request bodies to Sentry and keep the chat
  identity proof out of tracebacks: saving a role carries a live Matrix access
  token, which error reports were shipping verbatim.
- ♿️(profiles) Make the role label and its editor usable without a mouse: the
  badge truncates with an ellipsis instead of cutting mid-word and no longer
  crowds out the conversation name, the field and preset borders meet the 3:1
  contrast a control needs, and the length limit and save failure are announced
  with the field instead of stranding the focus.
- ✨(frontend) Encrypt conversations end to end. A private message is always
  encrypted; a group room carries the choice, made once at creation because
  Matrix offers no way back. Encrypted conversations are marked with a lock in
  the conversation list and in the room header.
- ✨(profile) Add optional global role labels (PO, PM, DEV or a custom title),
  editable or removable at any time from the account menu and displayed beside
  people in conversations. Verify chat identity when saving a role.
- ✨(bots) Answer `@Ariane` in the chat of a meeting call, from what was said
  and written in the call since the person asking arrived.
- ✨(meetings) Close a meeting on its own once its planned end has passed
  and nobody is left in the call, and let every member of the conversation
  download the archive of a closed meeting: agenda, participants, documents,
  transcript and call chat.
- ✨(meetings) Save the transcript of a meeting in Docs when its organizer
  closes it, and list it in the meeting documents. A scribe service relays
  the live subtitles of the Hub meetings to the backend.
- ✨(search) Jump straight to a message found via search: opening it now
  scrolls its conversation to the exact message instead of the latest one,
  and briefly flashes the row so it's easy to spot.
- ✨(frontend) Add real-time Matrix presence and availability controls
- ✨(frontend) Create a new Espace or Salon from the left panel, alongside
  direct messages: a round "+" next to the espace switcher, and one next
  to the Direct messages/Rooms section titles, Discord-style. Naming a
  salon always creates a fresh room, even if the same people already
  share an unrelated chat elsewhere. Add a "scroll to most recent
  message" button in the conversation view.
- ✨(search) Show a matching message's own conversation (avatar and name)
  in its search result row, and use the app's own design tokens instead
  of a temporary placeholder style.
- ✨(frontend) Name a meeting, plan its duration or schedule it ahead,
  follow its progress in the meeting window, and let its organizer rename,
  extend or close it.
- ✨(bots) Add Ariane, an assistant reachable with `@Ariane` in any room she
  has been invited to. She answers only when addressed, reads the thread and
  the room history that followed her arrival, and changes register with
  `/juriste`, `/avocat`, `/po` and `/pm`. Answers come from the Albert API,
  from the server only. The context is cut at both her own arrival and the
  asker's history horizon, so she never reads back what either of them is not
  entitled to. She cannot work in encrypted rooms, which includes every private
  message. `/aide` lists the commands and states what she reads.
- ✨(bots) Put Ariane in every room she can read. A clear group room invites
  her at creation and she joins at once, so her context starts with the room's
  first message. A conversation with her alone is not encrypted, and she can
  be found in the people search. She is kept out of encrypted rooms, which
  includes every private message between people.
- ✨(frontend) Suggest room members with `@` and assistant commands with `/`
  in the message composer. The list follows the ARIA combobox pattern and is
  usable with a screen reader.
- ✨(frontend) Show real profile/group photos in the account menu, chat
  header and members list. Reorder the account menu, add Direct messages
  filter tabs, and fix the language picker only applying French.
- ✨(frontend) Open a meetings panel from the conversation header, with the
  meetings list, a creation form and the history of past meetings and their
  documents. The call is now started from "Start now" in that form.
- ✨(frontend) Start a temporary meeting from a conversation, shown in a Meet
  window inside the Hub that can be minimized to keep using the Hub during the
  call. Record the call in the Matrix room so every member can rejoin it.
- ✨(frontend) Attach .txt or .md files to the agenda and the documents of a
  new meeting. Add documents by link from the Docs button.
- ✨(backend) Create Meet rooms through the Meet external API. Add the
  `/meetings/` endpoint, enabled once the Meet application credentials are set.
  Rooms are public by default so they can be joined from an embedded frame.
- ✨(frontend) Search joined conversations by name and current participants.
  Persist the search index separately and prepare small rooms progressively.
  Add a QuickSearch modal with local results across connected accounts.
  Open search from any page with Cmd+K or Ctrl+K.
- ✨(search) Search message content alongside conversations, with
  Discord-style filters (`from:`, `mentions:`, `has:`, `before:`/`during:`/
  `after:`). Show matches in a "Messages" section of the search modal with
  highlighted excerpts.
- ✨(search) Persist the message search index to IndexedDB so it survives a
  page reload. Backfill a room's older history (up to 200 messages or 90
  days, whichever comes first) automatically when it is opened, or on demand
  per room from the search modal, with indexing progress shown per room.
- ✨(frontend) Notify incoming messages, thread replies and invitations.
  Play sound on receipt and show browser notifications when Hub is unfocused.
  Request permission on incoming activity with a user-gesture fallback.
  Preload audio on arrival without replaying missed alerts.
- 🏗️(frontend) Initialize the Hub frontend project
- 🏗️(frontend) Initialize unit tests setup
- 🏗️(frontend) Initialize end-to-end (e2e) tests setup
- ✨(frontend) Add chat layout with LeftPanel and virtualized chat view
- ✨(frontend) Add message reactions bar with reaction toggle and emoji picker
- ✨(frontend) Add conversation threads with tools panel and unread banner
- ✨(frontend) Add new conversation page logic
- ✨(frontend) Open conversation when sending to it from the new chat search
- ✨(docker) Add a local dev-only Matrix stack with Keycloak auth and seed
- ✨(docker) Add a Matrix reset command with users-only provisioning
- ✨(frontend) Add the local Matrix frontend runtime with lazy MAS/OIDC client
  setup
- ✨(frontend) Bridge Matrix `/sync` onto the real-time chat event stream
- ✨(frontend) Send text messages from the Hub to Matrix conversations
- ✨(frontend) Start a new Matrix conversation from the new chat search
- ✨(frontend) Accept and refuse incoming Matrix invitations
- ✨(frontend) Add Matrix unread indicators and read receipts
- ✨(frontend) Add Matrix thread reading, replies, and creation
- ✨(frontend) Add Matrix reactions on conversation and thread timelines
- ✨(frontend) Add read-only chat members and conversation favourites
- ✨(frontend) Leave and forget conversations from the chat header
- ✨(frontend) Add Matrix first-unread separator and anchored navigation

### Changed

- ✨(frontend) Expand the message composer up to eight lines
- ⚡(frontend) Speed up the emoji picker and align reaction artwork
- 💄(frontend) Improve message dates and bubble readability
- 💄(frontend) Align the sidebar branding and account controls with Tchap
- ♻️(frontend) Streamline the new-chat conversation flow
- ⬆️(frontend) Migrate to ui-components 1.0.0
- ♻️(frontend) Use the local Matrix account as the sole chat runtime
- ♻️(frontend) Show Documents as unavailable until Matrix media support lands
- ♻️(frontend) Simplify the conversation auto-scroll onto the Virtuoso API
- 💄(frontend) Use the brand color for the current user's message bubbles
- 🔥(frontend) Remove the meeting entry from the side panel quick actions

### Fixed

- 🐛(bots) Check whether a room is encrypted once Ariane is in it: before,
  the refusal to read its state passed for "not encrypted".
- 🐛(bots) Keep the latest replies of a long thread in Ariane's context, not
  the oldest ones.
- 🐛(bots) Remember the pings Ariane handled in the shared cache, so a
  replayed transaction reaching another worker is not answered twice.
- 🐛(bots) Keep Ariane's reading horizon at the join when someone changes
  their display name or avatar, which used to reset it to that change.
- 🐛(meetings) Accept an empty `chat_id` when creating a meeting, as when it
  is left out, instead of answering 400.
- 🐛(meetings) Close a meeting planned without an end once its call is empty
  an hour after it began: it used to stay open for good.
- 🐛(meetings) Refuse a meeting whose planned end is not after its start,
  which gave negative durations in Ariane's messages.
- 🐛(meetings) Save a meeting transcript in Docs once when the automatic
  closing and the organizer (or a double click) close it at the same time.
- 🐛(meetings) Refuse a member or fall back to a generic room name when the
  Matrix admin token is missing, instead of failing with a server error.
- 🐛(search) Fix the jump to a message found via search: it could fail to
  scroll when also switching conversation, land without any visible
  motion, or break the conversation view entirely when the target message
  could no longer be resolved.
- 🐛(meetings) Let the whiteboard collaborate inside the meeting window:
  Excalidraw turned collaboration off in a frame, so each participant drew
  alone on the board kept from the previous meeting, and nothing was saved.
- 🐛(frontend) Send the user back to sign in when the identity provider
  refuses the Matrix refresh token, instead of failing on a runtime error.
- 🐛(frontend) Let every member start a meeting in conversations created by
  the Hub, and explain the refusal before creating a Meet room elsewhere.
- 🐛(frontend) Restore unread navigation in conversations without a read marker
- 🐛(frontend) Keep the thread root message toolbar fully accessible
- 🐛(frontend) Follow Matrix timeline and count updates for deleted thread
  replies
- 🐛(frontend) Focus the thread composer whenever Reply is clicked
- 🐛(frontend) Keep the thread composer compact when opening the tools panel
- 🐛(frontend) Restore edit and delete actions on newly sent thread replies
- 🐛(frontend) Resolve newly sent messages before editing or deleting them
- 🐛(frontend) Restore message content when an optimistic edit or deletion
  fails
- 🐛(frontend) Keep modals above chat headers and messages below them
- 🐛(frontend) Show an error toast when a chat message fails to send
- 🐛(frontend) Reset the composer draft when switching conversation
- 🐛(frontend) Reuse pending direct invitations when starting a conversation
- 🌐(frontend) Translate the current user's optimistic thread author
- 🐛(search) Fix lint errors in the message search engine (unused imports,
  unused parameter, `any` types)
- 🎨(search) Run Prettier on the message search files

[unreleased]: https://github.com/suitenumerique/docs/compare/main
