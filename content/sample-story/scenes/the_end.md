---
key: the_end
title: Dawn
act: 3
is_bottleneck: false
is_ending: true
reads_flags:
  - path_taken
map:
  x: 0
  y: 5
choices: []
variants:
  - slot: ending_text
    when:
      path_taken: left
    text: |-
      The traveler emerged from the wood at dawn. They were tired, and they could not remember what they had seen among the oaks, only that they would not walk that way again.
    priority: 10
  - slot: ending_text
    when:
      path_taken: right
    text: |-
      The traveler left the chapel at dawn. The woman pressed something into their hand — a seed, or a stone, smooth and warm — and said nothing. The hill was easier going down.
    priority: 10
  - slot: ending_text
    when: {}
    text: |-
      The traveler walked on. The road did not end, but this part of the story did.
    priority: 0
---

## Morning

{{ending_text}}

The lantern at the crossroads was out. The dead oak stood against a pale sky, and the traveler thought, for the first time in a long time, that the day might be a good one.

They kept walking. That is what travelers do.
