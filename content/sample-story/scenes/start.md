---
key: start
title: The Lantern
act: 1
is_bottleneck: false
is_ending: false
reads_flags: []
map:
  x: 0
  y: 0
choices:
  - key: go_left
    label: Take the left road into the wood
    to: left_path
    sets:
      path_taken: left
    requires: {}
  - key: go_right
    label: Take the right road up the hill
    to: right_path
    sets:
      path_taken: right
    requires: {}
variants:
  - slot: opening_mood
    when: {}
    text: |-
      The air smelled of rain that had not yet fallen. The lantern swayed in a wind the traveler could not feel, its light making the dead oak seem to breathe.
    priority: 0
  - slot: opening_mood
    when:
      path_taken: left
    text: |-
      The wood was dark, and the dark was familiar, the way old dreams are familiar — the kind you wake from tired.
    priority: 10
  - slot: opening_mood
    when:
      path_taken: right
    text: |-
      The hill was bare and pale, the grass the color of bone. Somewhere above, a dog barked once and then was silent.
    priority: 10
---

## The Crossroads

{{opening_mood}}

The traveler stood where the road split. The lantern above threw two shadows on the ground, one for each path, as though even their silhouette could not decide.

To the left, the road sank into a wood of old oaks. To the right, it climbed a bare hill toward a pale shape that might have been a building, or might have been a trick of the last light.

The candle in the satchel was half spent. Night was coming. A choice had to be made, and the traveler had learned long ago that not choosing was itself a choice — and always the worst one.
