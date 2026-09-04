# Theme pack portraits

Leonardo outputs land here, one directory per theme key:

```
public/portraits/<key>/idle.jpg
public/portraits/<key>/talking.jpg
```

Keys: sunny, console, cog, sprite, margin, curator, sage, pilot,
pixel, quiet, specter. (Cyberpunk uses the original /delamain.jpg +
/delamain-talking.jpg at the public root.)

Generation prompts, Leonardo settings, and the seed-locking workflow:
`~/Desktop/LeonardoPrompts/Cascade/portrait-prompts.md`.

Until a theme's images exist, `<Portrait/>` renders its neutral SVG
placeholder — missing files here are expected, not a bug.
