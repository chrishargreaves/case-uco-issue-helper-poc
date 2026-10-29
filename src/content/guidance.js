// Plain-language prompts and examples for each part of the change request.
// The section order follows the UCO change-request template. Each prompt is
// kept to one or two sentences. Every text box has one example, shown in a
// folded "Example" control above the box rather than as placeholder text, so
// an empty box always looks empty. The examples together make one invented
// request (drone flight logs).

export const GUIDANCE = {
  title: {
    heading: 'Name the concept',
    prompt: 'A short title naming what cannot be represented today.',
    example: 'Represent drone flight logs',
  },

  keywords: {
    label: 'Keywords (optional)',
    prompt: 'Other words for the concept, separated by commas. They are used to search existing concepts and GitHub issues.',
    example: 'drone, UAV, flight log, flight path',
  },

  background: {
    heading: 'Background',
    prompt: 'What you need, who needs it, and why, in your own words.',
    fields: {
      need: {
        label: 'What do you need to represent?',
        example: 'The flight log recorded by a drone: when it flew, where, and at what altitude.',
      },
      audience: {
        label: 'Who needs it?',
        example: 'Examiners who extract data from seized drones, and tool vendors who export it.',
      },
      importance: {
        label: 'Why does it matter?',
        example: 'Flight logs are often the key evidence in drone cases, but each tool currently invents its own representation.',
      },
      details: {
        label: 'Anything else (optional)',
        example: 'Today the flight log is recorded as a generic event log, which loses the position and altitude of each entry.',
      },
    },
  },

  requirements: {
    heading: 'Requirements',
    prompt: 'What CASE/UCO must be able to do, one statement per box, each one checkable as met or not met.',
    example: 'It must be possible to represent a drone flight log, linked to the drone that recorded it.',
    add: 'Add requirement',
  },

  benefits: {
    heading: 'Benefits',
    prompt: 'What becomes possible, or easier, if this is accepted?',
    example: 'Tools can exchange drone flight data without loss.',
  },

  risks: {
    heading: 'Risks',
    prompt: 'Could this cause problems, such as overlap with an existing concept?',
    example: 'It may overlap with the existing geolocation log concepts.',
    noneLabel: 'I am not aware of any risks',
  },

  competencies: {
    heading: 'Questions the data should answer',
    prompt: 'Describe a situation where the concept would be used, a question you could not answer today, and the answer you would expect. Including things that should not match makes a wrong answer easy to spot.',
    scenarioLabel: 'Situation',
    scenarioExample: 'A drone was seized near a prison and its flight log was extracted. The log covers three flights.',
    questionLabel: 'Question',
    questionExample: 'Which flights passed over the prison boundary?',
    resultLabel: 'Expected answer',
    resultExample: 'One flight; two of its logged positions fall inside the boundary. The other two flights do not.',
    itemLabel: 'Situation',
    add: 'Add a situation',
    addQuestion: 'Add another question',
  },

  solution: {
    heading: 'Solution suggestion (optional)',
    prompt: 'If you have an idea of how CASE/UCO could change, describe it briefly.',
    example: 'A new class for a drone flight log, and a property linking it to the drone.',
    mentionRelated: 'Mention the concepts I marked as related',
    transcriptionLabel: 'My examples may be copied into the CASE-Examples repository, with credit',
  },

  search: {
    heading: 'Check what already exists',
    prompt: 'Search for the concept before asking for it, and mark anything related. The search starts from your title and keywords.',
    useTitle: 'Use my title and keywords',
    coreHeading: 'Already in CASE/UCO',
    extensionHeading: 'In extensions (SOLVE-IT, CAC)',
    extensionNote: 'Not part of CASE/UCO, but shows how another project has modelled it.',
    nearlyFits: 'If this nearly fits, a request to correct or extend it may suit better. This tool does not yet guide that kind of request.',
    mark: 'Mark as related',
    unmark: 'Marked as related',
    markShort: 'Mark',
    unmarkShort: 'Marked',
    searchIssues: 'Search existing issues',
    empty: 'No matches. Try a shorter or different word.',
  },

  destination: {
    heading: 'Where it goes',
    prompt: 'Requests go to UCO or CASE; the suggestion is based on the concepts you marked or searched for.',
    duplicates: 'Check whether someone has already asked for this:',
  },
};
