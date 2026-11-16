This is a Massing project container (.mass) — a plain ZIP archive.

Everything inside is either JSON (UTF-8) or a standard AEC file format. There is no proprietary
encoding anywhere in this container, and you do not need Massing to read it.

  manifest.json      What this container is: format id, version, when it was written, an inventory
                     of every entry, and `excluded` — what was deliberately NOT included.
  README.txt         This file.
  project.json       The project itself: id, name, origin, and the name of its source IFC.
  data/<table>.json  One file per table. Each is a JSON array of row objects; keys are column names.
  geometry/          The source IFC (open with any IFC tool) and model.frag, a pre-converted
                     geometry tile used for fast viewing. The IFC is the source of truth; the .frag
                     is derived and can be regenerated from it.
  blobs/             File attachments, stored under their original storage keys.

Identity: building elements are referenced by IFC GlobalId throughout. Those ids are stable across
exports and across tools, so a row in data/ can always be tied back to an element in the IFC.

Not included, on purpose (see manifest `excluded`): user accounts, the audit log, application
settings and saved external connections. Those belong to a machine or an account, not to a project.
