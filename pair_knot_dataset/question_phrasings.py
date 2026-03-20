"""
question_phrasings.py — 20 question phrasings per task for the VLM benchmark.

Each task has a list of phrasing dicts:
  - "question": the varied question body (no answer format instructions)

The answer-format suffix is defined once per task in ANSWER_FORMATS and
appended at runtime by vlm_benchmark.py.

Total: 10 tasks × 20 phrasings = 200 unique questions.
"""

from __future__ import annotations

# ═══════════════════════════════════════════════════════════════════
# ANSWER FORMAT SUFFIXES — one per task, appended to every phrasing
# ═══════════════════════════════════════════════════════════════════

ANSWER_FORMATS: dict[str, str] = {
    "T01_knotted_direct": (
        "First line: one word only — KNOTTED or UNKNOTTED\n"
        "Second line: one sentence describing the key visual evidence."
    ),
    "T02_knotted_cot": (
        "Think step by step, then give your final answer on the LAST line: "
        "one word only — KNOTTED or UNKNOTTED"
    ),
    "T03_crossing_count": (
        "Choose one:\n"
        "  A) 0 crossings — simple loop, no over-under patterns\n"
        "  B) 3-4 crossings — simple knot (e.g. trefoil, figure-eight)\n"
        "  C) 5-7 crossings — moderately complex knot\n"
        "  D) 8 or more crossings — very complex knot\n\n"
        "Answer with the letter only: A, B, C, or D."
    ),
    "T04_can_untie": (
        "Answer with one word only: YES or NO."
    ),
    "T06_knot_family": (
        "Choose one:\n"
        "  UNKNOT — a simple loop with no genuine over-under crossings; "
        "may appear wavy or twisted but can be smoothed into a circle\n"
        "  TORUS — a torus knot (e.g. trefoil, cinquefoil); "
        "has 3 or more lobes arranged symmetrically like a clover or star, "
        "with a repeating over-under weaving pattern\n"
        "  TWIST — a twist knot (e.g. figure-eight); "
        "forms a flattened pretzel shape with a central twist region "
        "where strands cross back and forth\n"
        "  OTHER — none of the above, or too complex to tell\n\n"
        "Answer with one word only: UNKNOT, TORUS, TWIST, or OTHER."
    ),
    "T09_loose_knot_trap": (
        "Answer: ACTUAL_KNOT if it is truly knotted, "
        "LOOSE_ILLUSION if it only looks knotted but is actually unknotted."
    ),
    "T10_linked_or_not": (
        "Answer with one word only: LINKED or UNLINKED."
    ),
    "T11_hopflink_or_not": (
        "Answer with one word only: HOPF or NOT_HOPF."
    ),
    "T12_link_components": (
        "Answer with a single integer (e.g., 2, 3, 4)."
    ),
    "T13_same_knot_type": (
        "Answer with one word only: SAME or DIFFERENT."
    ),
}


# ═══════════════════════════════════════════════════════════════════
# QUESTION PHRASINGS — 20 per task
# ═══════════════════════════════════════════════════════════════════

PHRASINGS: dict[str, list[str]] = {}

# ── T01: Knotted Direct ──────────────────────────────────────────

PHRASINGS["T01_knotted_direct"] = [
    # 1 — original baseline
    "Look at this 3D image of a closed rope loop.\n"
    "A knotted loop has places where the rope clearly crosses over and under "
    "itself in an interlocking pattern that cannot be untangled without cutting.\n"
    "An unknotted loop may look wavy or twisted but has no true over-under crossings.\n\n"
    "Is this rope KNOTTED or UNKNOTTED?",

    # 2 — simple direct
    "Examine this 3D rendering of a closed loop of rope.\n"
    "Does this rope form a genuine knot, or is it unknotted?",

    # 3 — definition-led
    "A knot is a loop with crossings where strands truly interlock (over-under pattern).\n"
    "An unknot has no such interlocking, even if the rope appears tangled.\n\n"
    "Looking at this 3D image, is the loop knotted or unknotted?",

    # 4 — negative framing
    "Can this closed rope loop be smoothly rearranged into a simple circle "
    "without cutting? If yes, it is unknotted; if no, it is knotted.\n\n"
    "Looking at this 3D image, classify the loop as KNOTTED or UNKNOTTED.",

    # 5 — visual cue emphasis
    "Focus on the crossings in this 3D rope loop image.\n"
    "Do you see genuine over-under interlocking patterns, "
    "or only superficial twists and waves?\n\n"
    "Is this rope KNOTTED or UNKNOTTED?",

    # 6 — topological framing
    "In topology, a closed curve is knotted if it cannot be continuously "
    "deformed into a flat circle without self-intersection.\n\n"
    "Based on this 3D image, is the loop KNOTTED or UNKNOTTED?",

    # 7 — scenario-based
    "Imagine you are holding this rope loop in your hands.\n"
    "Could you rearrange it into a flat circle without cutting, "
    "or would the interlocking crossings prevent that?\n\n"
    "Is the rope KNOTTED or UNKNOTTED?",

    # 8 — comparison framing
    "Compare this rope loop to a simple rubber band.\n"
    "A rubber band is unknotted — it forms a simple circle.\n"
    "Does this rope loop have structural crossings that make it fundamentally "
    "different from a rubber band?\n\n"
    "Classify it as KNOTTED or UNKNOTTED.",

    # 9 — binary choice emphasis
    "This image shows a 3D closed rope loop. There are exactly two possibilities:\n"
    "either the rope is genuinely knotted (has interlocking crossings), "
    "or it is unknotted (no true crossings, just apparent twists).\n\n"
    "Which is it — KNOTTED or UNKNOTTED?",

    # 10 — crossing analysis
    "Study the 3D rope loop in this image.\n"
    "At each apparent crossing, determine whether one strand passes over "
    "and the other passes under in a way that locks them together.\n\n"
    "Based on your analysis, is this rope KNOTTED or UNKNOTTED?",

    # 11 — confidence-seeking
    "Look carefully at this 3D image of a rope loop.\n"
    "Does this rope contain a genuine knot with interlocking crossings, "
    "or is it simply a wavy unknotted loop?\n\n"
    "State whether it is KNOTTED or UNKNOTTED.",

    # 12 — instructional
    "You are evaluating a 3D image for a topology study.\n"
    "Determine whether this closed rope loop is knotted (has irreducible crossings) "
    "or unknotted (all crossings can be removed by deformation).\n\n"
    "Is it KNOTTED or UNKNOTTED?",

    # 13 — physical test framing
    "If you pulled gently on opposite sides of this rope loop, "
    "would the crossings tighten into an irreversible knot, "
    "or would they slide apart until the rope forms a simple ring?\n\n"
    "Based on this 3D image, is the rope KNOTTED or UNKNOTTED?",

    # 14 — question inversion
    "Is this 3D rope loop unknotted — meaning it could be smoothed into "
    "a simple circle — or is it knotted with genuine interlocking strands?\n\n"
    "Classify as KNOTTED or UNKNOTTED.",

    # 15 — mathematical phrasing
    "In mathematical knot theory, a closed curve embedded in 3D space "
    "is either equivalent to the unknot (trivial) or it is knotted (nontrivial).\n\n"
    "Examining this 3D rendering, is this loop KNOTTED or UNKNOTTED?",

    # 16 — feature detection
    "Identify whether this closed rope loop has regions where the rope "
    "genuinely threads through itself (knotted) or merely wraps loosely "
    "without true interlocking (unknotted).\n\n"
    "Is this KNOTTED or UNKNOTTED?",

    # 17 — observation-first
    "Observe the 3D rope loop in this image carefully.\n"
    "Note any locations where the rope appears to cross itself.\n"
    "Are these crossings genuinely interlocked, forming a knot?\n\n"
    "State: KNOTTED or UNKNOTTED.",

    # 18 — elimination
    "If you could shrink every crossing in this rope loop by sliding "
    "the strands, would all crossings eventually vanish, leaving a plain circle?\n"
    "If yes, the loop is unknotted. If some crossings cannot be removed, "
    "the loop is knotted.\n\n"
    "Is this rope KNOTTED or UNKNOTTED?",

    # 19 — pedagogical
    "Teaching moment: a truly knotted rope loop has at least one crossing "
    "where the over-under pattern cannot be undone without cutting.\n"
    "An unknotted loop may look complicated but lacks such patterns.\n\n"
    "Looking at this 3D image, is the rope KNOTTED or UNKNOTTED?",

    # 20 — concise
    "3D image of a closed rope loop.\n"
    "Knotted or unknotted?",
]

# ── T02: Knotted with Chain-of-Thought ────────────────────────────

PHRASINGS["T02_knotted_cot"] = [
    # 1 — original baseline
    "Look at this 3D image of a closed rope loop. Reason step by step:\n"
    "1. How many places does the rope cross over or under itself?\n"
    "2. If you could grab both sides of a crossing, could you slide them apart?\n"
    "3. Based on this, is the rope truly knotted or just tangled-looking?",

    # 2 — analysis-first
    "Analyze this 3D rope loop image by working through these steps:\n"
    "1. Identify all apparent crossings.\n"
    "2. For each crossing, determine if one strand goes over while the other goes under.\n"
    "3. Assess whether these crossings are locked or removable.\n"
    "4. Conclude whether the rope is knotted or unknotted.",

    # 3 — tracing approach
    "Trace the path of the rope in this 3D image:\n"
    "1. Start at any point and follow the rope around.\n"
    "2. At each crossing, note whether the rope goes over or under.\n"
    "3. Could you rearrange the rope to remove all crossings?\n"
    "4. Determine if this is a genuine knot or an unknotted loop.",

    # 4 — deformation reasoning
    "Consider this 3D rope loop and reason through:\n"
    "1. What would happen if you tried to flatten this loop into a circle?\n"
    "2. Would any crossings resist being pulled apart?\n"
    "3. Are the interlocking patterns permanent or temporary?\n"
    "4. Is this rope knotted or unknotted?",

    # 5 — structural analysis
    "Examine the structure of this 3D rope loop step by step:\n"
    "1. Count the number of strand crossings visible.\n"
    "2. Do strands interlock in an over-under alternating pattern?\n"
    "3. Could a continuous deformation turn this into a simple circle?\n"
    "Conclude: is it knotted or unknotted?",

    # 6 — visual inspection
    "Perform a visual inspection of this 3D rope loop:\n"
    "1. Look at the overall shape — is it complex or simple?\n"
    "2. Zoom in on crossing points — are they genuine interlocks?\n"
    "3. Consider whether complexity implies a real knot.\n"
    "State whether the rope is knotted or unknotted.",

    # 7 — logical deduction
    "Use logical reasoning to classify this 3D rope loop:\n"
    "1. A true knot requires at least one non-removable crossing.\n"
    "2. Identify the crossings in this image.\n"
    "3. For each, determine if it could be undone by sliding.\n"
    "4. Deduce: is this KNOTTED or UNKNOTTED?",

    # 8 — physical simulation
    "Imagine manipulating this 3D rope loop with your hands:\n"
    "1. Try to mentally pull apart each crossing.\n"
    "2. Do any crossings resist separation?\n"
    "3. Would the rope eventually lie flat as a circle, or is it locked?\n"
    "Based on this reasoning, is the rope knotted or unknotted?",

    # 9 — topological perspective
    "Apply topological reasoning to this 3D rope loop:\n"
    "1. In topology, crossings matter only if they cannot be removed by isotopy.\n"
    "2. Examine each crossing — is it essential or removable?\n"
    "3. If all crossings are removable, the loop is unknotted.\n"
    "Determine: KNOTTED or UNKNOTTED?",

    # 10 — comparative reasoning
    "Compare this 3D rope loop to known structures:\n"
    "1. Does it look like a simple circle (unknot)?\n"
    "2. Does it have a clover-like pattern (trefoil knot)?\n"
    "3. Does it have a pretzel-like twist (figure-eight knot)?\n"
    "4. Or does it merely look tangled but is actually simple?\n"
    "Conclude: KNOTTED or UNKNOTTED?",

    # 11 — systematic check
    "Systematically evaluate this 3D rope loop:\n"
    "Step 1: How many crossings do you see?\n"
    "Step 2: At each crossing, which strand is on top?\n"
    "Step 3: Do the crossings form a pattern that locks the rope?\n"
    "Final determination: KNOTTED or UNKNOTTED?",

    # 12 — question-driven
    "Answer these questions about the 3D rope loop:\n"
    "1. Does the rope cross over itself at any point?\n"
    "2. If yes, are these crossings interlocked or merely overlapping?\n"
    "3. Could you theoretically untangle it without cutting?\n"
    "Then state: is it knotted or unknotted?",

    # 13 — evidence-based
    "Gather evidence from this 3D rope loop image:\n"
    "1. List the locations where strands cross.\n"
    "2. Evaluate the over-under pattern at each crossing.\n"
    "3. Determine if any crossings are topologically essential.\n"
    "Based on the evidence: KNOTTED or UNKNOTTED?",

    # 14 — elimination method
    "Use process of elimination on this 3D rope loop:\n"
    "1. Start by assuming it is unknotted.\n"
    "2. Look for evidence that contradicts this — genuine interlocking crossings.\n"
    "3. If you find irreducible crossings, it must be knotted.\n"
    "What is your conclusion?",

    # 15 — depth analysis
    "Analyze the depth relationships in this 3D rope loop:\n"
    "1. Where one strand appears in front of another, which is truly on top?\n"
    "2. Do these depth relationships create locked crossings?\n"
    "3. Is the overall structure topologically nontrivial?\n"
    "Conclude with: KNOTTED or UNKNOTTED.",

    # 16 — simplified reasoning
    "Think about this 3D rope loop simply:\n"
    "1. Does the rope genuinely thread through itself?\n"
    "2. Or does it just wrap around without locking?\n"
    "3. Could you slide it into a plain circle?\n"
    "Your answer: KNOTTED or UNKNOTTED?",

    # 17 — falsification approach
    "Try to prove this 3D rope loop is unknotted:\n"
    "1. Can you find a sequence of moves that removes all crossings?\n"
    "2. If you cannot, the rope must be knotted.\n"
    "3. If you can, it is unknotted.\n"
    "What do you conclude?",

    # 18 — narrative reasoning
    "Imagine describing this 3D rope loop to a friend:\n"
    "1. How would you describe the path of the rope?\n"
    "2. Does the rope loop through itself at any point?\n"
    "3. Would your friend understand it as knotted or unknotted?\n"
    "Give your classification.",

    # 19 — mathematical check
    "Apply a mathematical check to this 3D rope loop:\n"
    "1. Count the minimum number of crossings.\n"
    "2. Analyze the crossing signs (over/under).\n"
    "3. A loop with zero minimum crossings is an unknot.\n"
    "Determine: KNOTTED or UNKNOTTED?",

    # 20 — quick assessment
    "Quickly assess this 3D rope loop:\n"
    "Does it have interlocking crossings that prevent it from being simplified "
    "to a circle, or is it topologically trivial?\n"
    "Reason briefly, then conclude: KNOTTED or UNKNOTTED.",
]

# ── T03: Crossing Count ──────────────────────────────────────────

PHRASINGS["T03_crossing_count"] = [
    # 1 — original
    "Look at this 3D image of a closed rope loop.\n"
    "Count the places where one section of rope passes over or under another.\n"
    "A crossing is where you can see one strand going OVER while another goes UNDER.\n"
    "Note: a trefoil knot has 3 crossings, and complex knots can have 7-10+.",

    # 2 — direct count
    "Examine this 3D rope loop and count the number of crossings.\n"
    "A crossing occurs wherever one strand passes over another.",

    # 3 — visual counting
    "In this 3D image of a rope loop, visually identify all points where "
    "the rope crosses over or under itself.\n"
    "How many such crossings are there?",

    # 4 — strand intersection
    "Study the 3D rope loop shown. Count the strand intersections — "
    "places where you can see one part of the rope on top of another.\n"
    "How many crossing points do you observe?",

    # 5 — complexity assessment
    "Assess the complexity of this 3D rope loop by counting its crossings.\n"
    "Each crossing is a point where two strands overlap with a clear over-under relationship.",

    # 6 — over-under focus
    "Focus on the over-under patterns in this 3D rope loop image.\n"
    "At how many distinct points does the rope pass over or under itself?",

    # 7 — topological counting
    "In knot theory, the crossing number is a key invariant.\n"
    "Looking at this 3D rope loop, how many crossings can you count?",

    # 8 — careful inspection
    "Carefully inspect this 3D rendering of a rope loop.\n"
    "Identify every location where one part of the rope crosses another.\n"
    "What is the total number of crossings?",

    # 9 — structural complexity
    "How structurally complex is this 3D rope loop?\n"
    "Count the number of places where strands cross over each other.",

    # 10 — depth crossing
    "In this 3D image, at how many points do two segments of the rope "
    "occupy different depths — one clearly in front of the other?\n"
    "Count these crossing points.",

    # 11 — observation task
    "Your task: observe this 3D rope loop and tally the crossing points.\n"
    "Each crossing is where one strand goes over and another goes under.",

    # 12 — enumeration
    "Enumerate the crossings in this 3D rope loop image.\n"
    "A crossing is defined as a point where two rope segments overlap "
    "with a distinct over-under arrangement.",

    # 13 — classification by crossings
    "Classify this 3D rope loop by its crossing count.\n"
    "How many points of over-under crossing does the rope exhibit?",

    # 14 — simple question
    "How many crossings does this 3D rope loop have?\n"
    "Count each point where one strand passes over another.",

    # 15 — estimation
    "Estimate the number of crossing points in this 3D rope loop.\n"
    "At each crossing, one strand visibly goes over while another goes under.",

    # 16 — systematic counting
    "Systematically count the crossings in this 3D rope loop:\n"
    "trace the rope and mark each point where it crosses another strand.",

    # 17 — minimal crossing
    "What is the apparent crossing number of this 3D rope loop?\n"
    "Count the minimum number of over-under crossings visible.",

    # 18 — quantitative analysis
    "Perform a quantitative analysis: how many self-crossings does "
    "this closed rope loop have in the 3D rendering?",

    # 19 — visual inspection
    "Visually inspect this 3D rope loop.\n"
    "At how many distinct locations do you see one part of the rope "
    "passing over or under another part?",

    # 20 — direct
    "Count the crossings in this 3D rope loop image.",
]

# ── T04: Can Untie ────────────────────────────────────────────────

PHRASINGS["T04_can_untie"] = [
    # 1 — original
    "Look at this 3D image of a closed rope loop.\n"
    "Could this loop be smoothly deformed into a perfect flat circle "
    "WITHOUT cutting the rope?",

    # 2 — direct
    "Can this 3D rope loop be untangled into a simple circle "
    "without cutting it?",

    # 3 — topological
    "Is this closed rope loop topologically equivalent to a simple circle?\n"
    "That is, could it be continuously deformed into a flat ring?",

    # 4 — physical framing
    "Imagine this rope loop is made of flexible rubber.\n"
    "Could you reshape it into a perfect circle without cutting or breaking it?",

    # 5 — unknot test
    "Is this rope loop an unknot — meaning it can be smoothly transformed "
    "into a plain circular loop without any cutting?",

    # 6 — deformation question
    "Could you continuously deform this 3D rope loop until it lies flat "
    "as a simple circle, without allowing the rope to pass through itself?",

    # 7 — practical framing
    "If you were holding this rope loop, could you manipulate it into "
    "a simple circle without cutting? Consider the crossings carefully.",

    # 8 — inverse knotted
    "Examine this 3D rope loop.\n"
    "Is it free of genuine knots — can it be simplified to a circle?",

    # 9 — simplification
    "Can the structure of this 3D rope loop be simplified?\n"
    "Specifically, could all crossings be removed to form a flat circle?",

    # 10 — mathematical
    "In knot theory, an unknot can be deformed to a standard circle.\n"
    "Can this 3D rope loop be so deformed?",

    # 11 — smoothing
    "Could this 3D rope loop be smoothed out into a perfect circle "
    "through continuous manipulation, without cutting the rope?",

    # 12 — isotopy
    "Is this closed rope loop ambient-isotopic to the standard unknot?\n"
    "In simpler terms, can it be reshaped into a flat circle?",

    # 13 — tangled vs knotted
    "This 3D rope loop may appear tangled.\n"
    "But could it actually be untangled into a simple circle without cutting?",

    # 14 — binary assessment
    "Assess this 3D rope loop: can it be reduced to a simple circle "
    "through continuous deformation (no cutting allowed)?",

    # 15 — everyday language
    "If someone handed you this rope loop, could you straighten it out "
    "into a simple ring without using scissors?",

    # 16 — reversibility
    "Are the twists and crossings in this 3D rope loop reversible?\n"
    "Could the loop return to a plain circle shape?",

    # 17 — essential crossings
    "Does this 3D rope loop have any essential (non-removable) crossings, "
    "or can all apparent crossings be eliminated to yield a simple circle?",

    # 18 — test question
    "Test: can this 3D closed rope loop be deformed into a circle "
    "without self-intersection or cutting?",

    # 19 — visual judgment
    "Based on the visual structure of this 3D rope loop, "
    "is it possible to unknot it into a simple circle?",

    # 20 — concise
    "Can this rope loop be deformed into a flat circle without cutting?",
]

# ── T06: Knot Family ─────────────────────────────────────────────

PHRASINGS["T06_knot_family"] = [
    # 1 — original
    "Look at this 3D image of a closed rope loop.\n"
    "Which knot family does it most likely belong to?",

    # 2 — classification
    "Classify this 3D rope loop into one of the following knot families.",

    # 3 — identification
    "Identify the knot family of this 3D rope loop based on its visual structure.",

    # 4 — pattern recognition
    "Examine the pattern of crossings in this 3D rope loop.\n"
    "Which knot family does this pattern correspond to?",

    # 5 — structural category
    "Based on the structural features of this 3D rope loop, "
    "which category of knot does it represent?",

    # 6 — visual matching
    "Match this 3D rope loop to the correct knot family "
    "by analyzing its crossing patterns and overall shape.",

    # 7 — topological classification
    "From a topological perspective, which knot family "
    "best describes this 3D rope loop?",

    # 8 — shape analysis
    "Analyze the shape of this 3D rope loop.\n"
    "Does it show characteristics of a specific knot family?",

    # 9 — symmetry-based
    "Consider the symmetry and crossing pattern of this 3D rope loop.\n"
    "Which knot family does it belong to?",

    # 10 — feature comparison
    "Compare the features of this 3D rope loop to standard knot families.\n"
    "Which family is the best match?",

    # 11 — descriptive
    "Describe and classify this 3D rope loop into the appropriate knot family.",

    # 12 — diagnostic
    "Using the visual characteristics of this 3D rope loop as diagnostic features, "
    "determine its knot family.",

    # 13 — expert classification
    "As a knot topology expert, classify this 3D rope loop "
    "into one of the standard knot families.",

    # 14 — lobe analysis
    "Examine the lobes and crossing patterns of this 3D rope loop.\n"
    "Which family of knots exhibits this type of structure?",

    # 15 — direct question
    "What knot family does this 3D rope loop belong to?",

    # 16 — visual taxonomy
    "Place this 3D rope loop into the correct taxonomic category of knot families "
    "based on its visual appearance.",

    # 17 — characteristic features
    "Identify the characteristic features of this 3D rope loop "
    "and match them to a knot family.",

    # 18 — geometric clues
    "Use the geometric clues in this 3D rope loop image "
    "to determine which knot family it represents.",

    # 19 — categorization
    "Categorize this 3D rope loop. Which knot family does its "
    "crossing pattern and shape most closely match?",

    # 20 — simple
    "Which knot family is this 3D rope loop?",
]

# ── T09: Loose Knot Trap ─────────────────────────────────────────

PHRASINGS["T09_loose_knot_trap"] = [
    # 1 — original
    "Look at this 3D image of a closed rope loop that appears complex.\n"
    "Examine the crossings carefully: does the rope form genuine "
    "over-under interlocking crossings that prevent unknotting, "
    "or could every apparent crossing be removed by sliding the rope?\n\n"
    "A real knot has strands that lock around each other.\n"
    "A loose illusion has strands that merely overlap without locking.",

    # 2 — trap emphasis
    "This 3D rope loop looks complicated, but appearances can be deceptive.\n"
    "Is this a genuinely knotted structure, or a loose illusion that "
    "only appears to be knotted?",

    # 3 — careful analysis
    "Carefully analyze the crossings in this 3D rope loop.\n"
    "Are they genuine interlocking crossings (actual knot), "
    "or superficial overlaps that could be pulled apart (loose illusion)?",

    # 4 — deception detection
    "Some rope configurations look knotted but are actually unknotted.\n"
    "Examine this 3D image: is this rope truly knotted, "
    "or is it a deceptive loose illusion?",

    # 5 — locking test
    "Test whether the crossings in this 3D rope loop are locked:\n"
    "If you pulled the strands at each crossing, would they hold (actual knot) "
    "or slide apart (loose illusion)?",

    # 6 — genuine vs apparent
    "Distinguish between genuine and apparent knotting in this 3D rope loop.\n"
    "Are the crossings structurally locked, or merely visual overlaps?",

    # 7 — skeptical analysis
    "Approach this 3D rope loop with skepticism.\n"
    "Despite its complex appearance, is it a real knot "
    "or just a loose arrangement that looks knotted?",

    # 8 — interlocking assessment
    "Assess whether the strands in this 3D rope loop genuinely interlock.\n"
    "True interlocking means the rope cannot be unknotted; "
    "false interlocking means it is a loose illusion.",

    # 9 — unknotting potential
    "Could every crossing in this 3D rope loop be removed by smoothly "
    "sliding the strands, or are some crossings permanently locked?",

    # 10 — visual trap
    "This 3D rope loop may be a visual trap.\n"
    "Does it have genuine topological crossings (actual knot), "
    "or are all crossings removable (loose illusion)?",

    # 11 — true vs false knot
    "Is this a true knot or a false knot?\n"
    "Examine the 3D rope loop crossings for genuine interlocking.",

    # 12 — structural integrity
    "Evaluate the structural integrity of the apparent knot in this 3D image.\n"
    "Are the crossings structurally necessary, or decorative overlaps?",

    # 13 — illusion check
    "Check for illusion: does this 3D rope loop contain crossings that "
    "genuinely prevent unknotting, or is the apparent complexity an illusion?",

    # 14 — practical test
    "Imagine trying to unknot this 3D rope loop without cutting.\n"
    "Would you succeed (meaning it is a loose illusion) "
    "or fail (meaning it is an actual knot)?",

    # 15 — critical examination
    "Critically examine this 3D rope loop.\n"
    "Complex appearance does not guarantee a genuine knot.\n"
    "Is this an actual knot or a loose illusion?",

    # 16 — over-under verification
    "Verify the over-under pattern in this 3D rope loop.\n"
    "Do the strands genuinely lock (actual knot), "
    "or merely pass alongside each other (loose illusion)?",

    # 17 — topological reality
    "What is the topological reality of this 3D rope loop?\n"
    "Is it a genuine knot with essential crossings, "
    "or a loose structure that is topologically trivial?",

    # 18 — deceiving complexity
    "This 3D rope loop appears complex. But is the complexity genuine?\n"
    "Determine whether this is an actual knotted structure "
    "or a loose illusion of knotting.",

    # 19 — strand behavior
    "Predict the behavior of the strands in this 3D rope loop:\n"
    "would they stay interlocked if manipulated (actual knot), "
    "or come apart freely (loose illusion)?",

    # 20 — binary trap
    "Two possibilities: this 3D rope loop is either a genuine knot "
    "with permanent crossings, or a loose arrangement that mimics a knot.\n"
    "Which is it?",
]

# ── T10: Linked or Not ───────────────────────────────────────────

PHRASINGS["T10_linked_or_not"] = [
    # 1 — original
    "You are shown an image containing multiple closed rope loops.\n"
    "Are any of the loops linked together (i.e., cannot be separated without cutting)?",

    # 2 — direct
    "Are the rope loops in this image linked or unlinked?",

    # 3 — separation test
    "Could the rope loops in this image be pulled apart without cutting, "
    "or are they linked together?",

    # 4 — topological linking
    "In topology, two loops are linked if one passes through the other.\n"
    "Are the loops in this image linked or unlinked?",

    # 5 — physical framing
    "Imagine these rope loops are real.\n"
    "Could you separate them by sliding them apart, "
    "or are they interlocked (linked)?",

    # 6 — chain test
    "Do any of the closed loops in this image pass through each other, "
    "forming a link? Or are they completely separate?",

    # 7 — interlocking check
    "Check whether the loops in this image are interlocked.\n"
    "Are they linked (cannot separate) or unlinked (can separate)?",

    # 8 — connection assessment
    "Assess the topological connection between the loops in this image.\n"
    "Are they linked together or independent of each other?",

    # 9 — threading
    "Does any loop in this image thread through another loop?\n"
    "If yes, they are linked; if no, they are unlinked.",

    # 10 — independence
    "Are the rope loops in this image topologically independent (unlinked) "
    "or dependent (linked)?",

    # 11 — separability
    "Can the loops shown in this image be separated from each other "
    "without breaking any loop?",

    # 12 — ring puzzle
    "Like a ring puzzle, determine whether the loops in this image "
    "are linked together or free from each other.",

    # 13 — observation
    "Observe the rope loops in this image.\n"
    "Do they pass through one another (linked) "
    "or exist independently (unlinked)?",

    # 14 — mutual relationship
    "What is the mutual relationship between the loops in this image?\n"
    "Are they linked or unlinked?",

    # 15 — entanglement
    "Are the loops in this image topologically entangled (linked) "
    "or completely separate (unlinked)?",

    # 16 — visual assessment
    "Visually assess: are the closed rope loops in this image "
    "linked together or separate?",

    # 17 — component interaction
    "Do the loop components in this image interact topologically "
    "(linked) or exist independently (unlinked)?",

    # 18 — simple question
    "Are these rope loops linked or unlinked?",

    # 19 — passing through
    "In this image of multiple rope loops, does any loop pass through "
    "the interior of another? Determine if they are linked or unlinked.",

    # 20 — binary classification
    "Classify the relationship between the loops in this image: "
    "LINKED or UNLINKED?",
]

# ── T11: Hopf Link or Not ────────────────────────────────────────

PHRASINGS["T11_hopflink_or_not"] = [
    # 1 — original
    "You are shown an image containing closed rope loops.\n"
    "A Hopf link is the simplest 2-component link: exactly two rings, "
    "each passing through the other exactly once.\n\n"
    "Important: chain links (3+ rings in a row), Borromean rings "
    "(3 rings mutually interlocked), and unlinked rings are NOT Hopf links.\n\n"
    "Is this a Hopf link?",

    # 2 — direct identification
    "Does this image show a Hopf link — two loops each passing through "
    "the other exactly once?",

    # 3 — definition check
    "A Hopf link consists of exactly two closed loops, each threading "
    "through the other a single time. Is this image a Hopf link?",

    # 4 — exclusion-based
    "This image shows linked rope loops. A Hopf link has exactly two rings, "
    "each passing through the other once. Chains, Borromean rings, "
    "and unlinked rings are not Hopf links.\n"
    "Is this a Hopf link?",

    # 5 — component counting
    "Count the loops and their interactions in this image.\n"
    "If there are exactly two loops, each passing through the other once, "
    "it is a Hopf link. Is this a Hopf link?",

    # 6 — simplest link
    "The Hopf link is the simplest possible link: two rings, one pass-through.\n"
    "Does this image depict a Hopf link?",

    # 7 — classification task
    "Classify this image: does it show a Hopf link (two mutually "
    "single-passing rings) or something else?",

    # 8 — structural match
    "Does the link structure in this image match a Hopf link?\n"
    "Remember: Hopf = exactly 2 loops, each through the other exactly once.",

    # 9 — comparison
    "Compare this image to a Hopf link: two rings interlocked once.\n"
    "Does it match?",

    # 10 — linking number
    "A Hopf link has a linking number of 1 between its two components.\n"
    "Does this image show a Hopf link?",

    # 11 — recognition
    "Can you recognize a Hopf link in this image?\n"
    "A Hopf link has exactly two loops passing through each other once.",

    # 12 — true or false
    "True or false: this image depicts a Hopf link "
    "(two rings, each passing through the other exactly once).",

    # 13 — specific identification
    "Is the link shown in this image specifically a Hopf link, "
    "or is it a different type of link?",

    # 14 — minimal link test
    "The Hopf link is the minimal nontrivial link.\n"
    "Does this image show exactly that structure?",

    # 15 — elimination
    "Eliminate possibilities: is this image a chain link? Borromean rings? "
    "Unlinked loops? Or is it specifically a Hopf link?",

    # 16 — visual match
    "Visually, does this image show two rings interlocked exactly once "
    "(Hopf link) or something more complex?",

    # 17 — two-component check
    "Verify: does this image contain exactly two loops, "
    "and do they link through each other precisely once (Hopf link)?",

    # 18 — topology question
    "In link topology, is this image an example of a Hopf link?",

    # 19 — pass-through count
    "Count how many times the loops in this image pass through each other.\n"
    "A Hopf link has exactly two loops with one mutual pass-through. Is this one?",

    # 20 — concise
    "Is this a Hopf link?",
]

# ── T12: Link Components ─────────────────────────────────────────

PHRASINGS["T12_link_components"] = [
    # 1 — original
    "You are shown an image containing multiple closed rope loops.\n"
    "How many separate loop components are present?",

    # 2 — counting
    "Count the number of distinct closed loops in this image.",

    # 3 — component enumeration
    "How many individual rope loop components can you identify in this image?",

    # 4 — separate rings
    "How many separate rings or closed loops are visible in this image?",

    # 5 — topological components
    "From a topological perspective, how many distinct loop components "
    "are present in this image?",

    # 6 — individual loops
    "Identify and count each individual closed loop in this image.\n"
    "How many are there?",

    # 7 — visual count
    "Visually count the number of closed rope loops shown in this image.",

    # 8 — distinct paths
    "How many distinct closed paths (loops) can you trace in this image?",

    # 9 — component analysis
    "Analyze this image and determine the number of separate loop components.",

    # 10 — simple count
    "How many loops are in this image?",

    # 11 — rope count
    "How many separate pieces of rope (each forming a closed loop) "
    "are shown in this image?",

    # 12 — ring count
    "Count the rings: how many closed loop components are in this image?",

    # 13 — tracing
    "If you traced each loop independently, how many separate loops "
    "would you draw for this image?",

    # 14 — enumeration task
    "Your task: enumerate the closed loop components in this image. "
    "How many are there?",

    # 15 — observation count
    "Observe this image carefully. How many distinct closed loops do you see?",

    # 16 — numerical answer
    "What is the total number of separate closed rope loops in this image?",

    # 17 — component detection
    "Detect and count all separate loop components shown in this image.",

    # 18 — identification
    "Identify how many individual closed curves (loops) are depicted in this image.",

    # 19 — quantitative
    "Quantify the number of closed loop components present in this image.",

    # 20 — direct
    "How many closed loops are in this image?",
]

# ── T13: Same Knot Type ──────────────────────────────────────────

PHRASINGS["T13_same_knot_type"] = [
    # 1 — original
    "You are shown Image 1 and Image 2, each showing a closed rope loop.\n"
    "Are they the SAME knot type (topologically equivalent — "
    "one could be continuously deformed into the other without cutting), "
    "or DIFFERENT knot types?",

    # 2 — comparison
    "Compare the two rope loops in Image 1 and Image 2.\n"
    "Do they represent the same knot type or different knot types?",

    # 3 — equivalence check
    "Are the knots in Image 1 and Image 2 topologically equivalent?\n"
    "That is, could one be deformed into the other without cutting?",

    # 4 — matching task
    "Do Image 1 and Image 2 show the same type of knot, "
    "or are they fundamentally different knot types?",

    # 5 — deformation test
    "Could the rope loop in Image 1 be continuously deformed "
    "into the rope loop in Image 2 without cutting?\n"
    "If yes, they are the same type; if no, they are different.",

    # 6 — classification comparison
    "Classify the knots in Image 1 and Image 2.\n"
    "Do they belong to the same knot type or different types?",

    # 7 — structural similarity
    "Assess the structural similarity between the rope loops in "
    "Image 1 and Image 2. Are they the same knot type or different?",

    # 8 — topological identity
    "In topology, two knots are the same type if one can be transformed "
    "into the other by continuous deformation.\n"
    "Are the knots in Image 1 and Image 2 the same type or different?",

    # 9 — visual comparison
    "Visually compare the two rope loops.\n"
    "Despite possible differences in appearance, "
    "are they topologically the same knot type or different?",

    # 10 — pair analysis
    "Analyze this pair of rope loop images.\n"
    "Are they the same knot type or different knot types?",

    # 11 — identification match
    "Identify the knot type in each image. Do Image 1 and Image 2 "
    "show the same type or different types?",

    # 12 — invariant comparison
    "Knots of the same type share topological invariants like crossing number.\n"
    "Based on visual inspection, are these two rope loops the same type?",

    # 13 — recognition
    "Do you recognize the same knot type in both Image 1 and Image 2, "
    "or are they different?",

    # 14 — binary classification
    "Classify this pair: are the two rope loops the same knot type "
    "or different knot types?",

    # 15 — crossing pattern match
    "Do the crossing patterns in Image 1 and Image 2 suggest they are "
    "the same knot type or different types?",

    # 16 — equivalence question
    "Are the two closed rope loops shown topologically equivalent "
    "(same type) or inequivalent (different types)?",

    # 17 — family match
    "Do the knots in Image 1 and Image 2 belong to the same knot family "
    "and type, or are they different?",

    # 18 — direct comparison
    "Look at both images. Same knot type or different?",

    # 19 — deformability
    "Is it possible to deform the knot in Image 1 into the knot in Image 2 "
    "without cutting? If so, they are the same; otherwise, different.",

    # 20 — concise
    "Same knot type or different knot types?",
]


# ═══════════════════════════════════════════════════════════════════
# UTILITY — build a full prompt from phrasing index
# ═══════════════════════════════════════════════════════════════════

def build_prompt(task_id: str, phrasing_index: int) -> str:
    """Combine a question phrasing with its answer format suffix."""
    phrasings = PHRASINGS.get(task_id, [])
    if not phrasings:
        raise ValueError(f"No phrasings for task {task_id}")
    question = phrasings[phrasing_index % len(phrasings)]
    answer_fmt = ANSWER_FORMATS.get(task_id, "")
    return f"{question}\n\n{answer_fmt}"


def num_phrasings(task_id: str) -> int:
    """Return the number of available phrasings for a task."""
    return len(PHRASINGS.get(task_id, []))


def get_all_task_ids() -> list[str]:
    """Return all task IDs that have phrasings defined."""
    return list(PHRASINGS.keys())


# ═══════════════════════════════════════════════════════════════════
# SELF-CHECK — verify counts
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    total = 0
    for tid in sorted(PHRASINGS.keys()):
        n = len(PHRASINGS[tid])
        total += n
        print(f"  {tid}: {n} phrasings")
    print(f"\n  Total: {total} unique questions across {len(PHRASINGS)} tasks")
    assert total == 200, f"Expected 200, got {total}"
    print("  ✓ All checks passed.")
