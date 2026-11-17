# Research and music references

Reviewed 2026-11-18. Facts informed implementation; no commercial sheet-music scans or proprietary tuner code are included.

## Tunings

- [Fender: 9 Essential Alternate Guitar Tunings](https://www.fender.com/articles/setup/alternate-guitar-tuning) — standard, Drop D/C, open tunings and DADGAD conventions.
- [Fender: Tune Like a Rock Star](https://www.fender.com/articles/setup/tune-like-a-rock-star) — low-to-high ordering, Drop D, Open G, D modal.
- [Yamaha: Alternate Bass Tunings](https://hub.yamaha.com/guitars/bass/alternate-bass-tunings/) — four-, five- and six-string bass variations; BEADG and EADGC.
- [Yamaha G50 owner’s manual](https://jp.yamaha.com/files/download/other_assets/1/320941/B1DE.pdf) — standard bass 4/5/6 layouts, including BEADGC.

Preset pitches are encoded as MIDI numbers, low to high, with concert A4=440 Hz by default. Drop tunings and uniform transpositions are calculated from standard interval layouts. Frequencies use equal temperament, `a4 * 2^((midi-69)/12)`.

## Harmony and scales

- [Ableton Learning Music: Modes](https://learningmusic.ableton.com/advanced-topics/modes.html) — the seven diatonic modes and their interval rotations.
- [Ableton: Seventh chords](https://learningmusic.ableton.com/advanced-topics/seventh-chords.html) — chord construction reference.
- [Berklee PULSE: All scales and arpeggios, bass clef](https://pulse.berklee.edu/content/practice/pdfs/PR_All_Scales_Arp_Bass_Clef.pdf) — modal scale notation reference.
- [Texas A&M Open Digital Publishing: Modes](https://odp.library.tamu.edu/stepstomusictheory/chapter/modes/) — modal scale relationships and altered degrees.

Fingerings are generated from pitch classes for the selected tuning. They are compact candidate voicings, not a transcription of a published chord dictionary. A four-fret search window limits hand span; users can choose a different position. Enharmonic note labels are simplified for fretboard readability, so they do not substitute for conventional key-specific notation.

## Jazz standards and scores

- [Hal Leonard: The Real Book Volume I, Sixth Edition, C edition](https://www.halleonard.com/product/240221/the-real-book-volume-i-sixth-edition) — authorized score source for the library’s Volume I selections.
- [Hal Leonard: The Real Book Volume II, Second Edition, C edition](https://www.halleonard.com/product/240222/the-real-book-volume-ii-second-edition) — authorized score source for Fly Me to the Moon.
- [Mississippi State University: All of Me, 1931 original catalog record](https://scholarsjunction.msstate.edu/cht-sheet-music/7698/) — composer/publication attribution; the archive explicitly restricts access to copyrighted material.
- [Library of Congress: Amazing Grace timeline](https://www.loc.gov/collections/amazing-grace/articles-and-essays/timeline/) — historical New Britain melody and its 1835 pairing in Southern Harmony.
- [IMSLP: Amazing Grace / Anonymous](https://imslp.org/wiki/Amazing_Grace_%28Newton%2C_John%29) — original Southern Harmony score and historical source identification. Modern arrangements on the same page have separate licenses and are not copied.

Commercial standards have chord-only practice charts and links to authorized published melody scores. The charts are simplified practice variations, not edition-accurate replacements. Practice keys and suggested tempos are editorial choices. “Studio Blues in F,” “Guide Tone Study,” and “Night Study” are new original exercises written for this app. Their ABC source contains the actual displayed melodies. The traditional “Amazing Grace” melody uses new practice harmony and engraving, not a modern copyrighted arrangement.

## Rhythm

- [Frozen Ape: Tempo](https://www.frozenape.com/tempo.html) — tap tempo, accents, subdivisions and saved rhythm workflow reference. JUNO uses its own interface and audio scheduler.
- [Web Audio scheduling](https://web.dev/articles/audio-scheduling) — audio-clock look-ahead scheduling.

## Web audio and authentication

- [TC Electronic PolyTune manual](https://service-tcgroup.tcelectronic.com/media/Polytune_DD_US.pdf) — inspiration for showing individual strings and an all-strings overview. JUNO Studio is independent and does not claim TC Electronic’s algorithm or hardware accuracy.
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — browser audio sampling interface.
- [MDN: getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) — microphone permission and secure-context constraints.
- [Firebase: Google Sign-In on web](https://firebase.google.com/docs/auth/web/google-signin) — account authentication.
- [Firebase: Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart) — HTTPS deployment.

Polyphonic analysis is an experimental, tuning-aware estimate. Shared harmonics, string balance, microphone noise reduction and low bass fundamentals can make a reliable independent estimate unavailable. The UI should show waiting/uncertain results instead of fabricated “in tune” values. Confirm a string individually for fine adjustment.
