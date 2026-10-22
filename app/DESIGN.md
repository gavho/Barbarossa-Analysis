# Design

Two themes, toggled in the header and saved in the workspace.

| Token | Tactical | Period ("1941") |
|---|---|---|
| background / card | `#0a0a0b` / `#121315` | `#e6dcc4` / `#efe7d3` paper |
| border | `#2a2b30` hairline | `#b3a580` |
| primary | `#69b9f8` (the original app's blue) | `#8b2e1f` grease-pencil red |
| header | `#0d0e10` | `#4c5441` feldgrau |
| display font | Barlow Condensed, uppercase | Saira Stencil One |
| basemap | Esri Dark Gray Canvas | Esri Shaded Relief, desaturated + paper tint |
| panel frame | corner brackets in primary | inset double rule |

- Text: Inter; numbers and dates: JetBrains Mono.
- Unit colors never change with theme (Armored #B55454, Motorized #4F6F8F, Mountain #8A6B4A, Infantry #4F7F5C,
  Security #C2A84A, Cavalry #7A5C8F; posture Move #5E8FD0, Reserve #77B484, Attack #DF6B35, Defend #DBCF4E).
- Plan overlay: phase lines teal `#00c2a8` (distinct from every unit color), advance lines in the historian's
  purple/blue/orange/black, small-pocket COA dashed.
- Motion: spring layout animations from the copied components; all disabled by `prefers-reduced-motion`.
- Map exports always use the paper palette so they print well.
