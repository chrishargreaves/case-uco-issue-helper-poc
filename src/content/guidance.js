// Plain-language prompts and worked examples for each part of the change
// request. The section order follows the UCO change-request template. Each
// prompt is kept to one or two sentences; the worked example throughout is one
// invented request (drone flight logs), plus the template's own competency
// example.

export const GUIDANCE = {
  title: {
    heading: 'Name the concept',
    prompt: 'A short title naming what cannot be represented today.',
    placeholder: 'For example: Represent drone flight logs',
  },

  background: {
    heading: 'Background',
    prompt: 'What you need, who needs it, and why, in your own words.',
    fields: {
      need: {
        label: 'What do you need to represent?',
        placeholder: 'For example: The flight log recorded by a drone: when it flew, where, and at what altitude.',
      },
      audience: {
        label: 'Who needs it?',
        placeholder: 'For example: Examiners who extract data from seized drones, and tool vendors who export it.',
      },
      importance: {
        label: 'Why does it matter?',
        placeholder: 'For example: Flight logs are often the key evidence in drone cases, but each tool currently invents its own representation.',
      },
      details: {
        label: 'Anything else (optional)',
        placeholder: 'For example: how you represent this today, or a link to a tool or data format.',
      },
    },
  },

  requirements: {
    heading: 'Requirements',
    prompt: 'What CASE/UCO must be able to do, one statement per box, each one checkable as met or not met.',
    placeholder: 'For example: It must be possible to represent a drone flight log, linked to the drone that recorded it.',
    examples: [
      'It must be possible to represent a drone flight log, linked to the drone that recorded it.',
      'It must be possible to record each position in the log with a time, a location and an altitude.',
    ],
    add: 'Add requirement',
  },

  benefits: {
    heading: 'Benefits',
    prompt: 'What becomes possible, or easier, if this is accepted?',
    placeholder: 'For example: Tools can exchange drone flight data without loss.',
  },

  risks: {
    heading: 'Risks',
    prompt: 'Could this cause problems, such as overlap with an existing concept?',
    placeholder: 'For example: It may overlap with the existing geolocation log concepts.',
    noneLabel: 'I am not aware of any risks',
  },

  competencies: {
    heading: 'Questions the data should answer',
    prompt: 'Describe a situation where the concept would be used, a question you could not answer today, and the answer you would expect. Including things that should not match makes a wrong answer easy to spot.',
    scenarioLabel: 'Situation',
    scenarioFieldLabel: 'What happens',
    scenarioPlaceholder: 'For example: A drone was seized near a prison and its flight log was extracted. The log covers three flights.',
    questionLabel: 'Question',
    questionPlaceholder: 'For example: Which flights passed over the prison boundary?',
    resultLabel: 'Expected answer',
    resultPlaceholder: 'For example: One flight; two of its logged positions fall inside the boundary. The other two flights do not.',
    examplesSummary: 'Show examples',
    examples: [
      {
        scenario: 'A drone was seized near a prison and its flight log was extracted. The log covers three flights.',
        question: 'Which flights passed over the prison boundary?',
        result: 'One flight; two of its logged positions fall inside the boundary. The other two flights stay outside it and should not be returned.',
        source: 'An invented example.',
      },
      {
        scenario: 'Three picture files were produced on an analyst\'s workstation over the course of an investigation.',
        question: 'Which picture files were taken from the evidence, and which were taken of the evidence?',
        result: 'From reviewing the investigative actions in the chain of custody, picture files generated when the instrument was the analyst\'s camera would be "taken of", while picture files generated when the instrument was a data extraction kiosk would be "taken from".',
        source: 'From the UCO change-request template.',
      },
    ],
    itemLabel: 'Situation',
    add: 'Add a situation',
    addQuestion: 'Add another question',
  },

  solution: {
    heading: 'Solution suggestion (optional)',
    prompt: 'If you have an idea of how CASE/UCO could change, describe it briefly.',
    placeholder: 'For example: A new class for a drone flight log, and a property linking it to the drone.',
    mentionRelated: 'Mention the concepts I marked as related',
    transcriptionLabel: 'My examples may be copied into the CASE-Examples repository, with credit',
  },

  search: {
    heading: 'Existing concepts',
    prompt: 'Check whether the concept already exists before asking for it.',
    placeholder: 'For example: drone, flight log, chain of custody',
    useTitle: 'Search for my title',
    coreHeading: 'Already in CASE/UCO',
    extensionHeading: 'In extensions (SOLVE-IT, CAC)',
    extensionNote: 'Not part of CASE/UCO, but shows how another project has modelled it.',
    nearlyFits: 'If this nearly fits, a request to correct or extend it may suit better. This tool does not yet guide that kind of request.',
    mark: 'Mark as related',
    unmark: 'Marked as related',
    searchIssues: 'Search existing issues',
    empty: 'No matches. Try a shorter or different word.',
  },

  destination: {
    heading: 'Where it goes',
    prompt: 'Requests go to UCO or CASE; the suggestion is based on the concepts you marked or searched for.',
    duplicates: 'Check whether someone has already asked for this:',
  },
};
