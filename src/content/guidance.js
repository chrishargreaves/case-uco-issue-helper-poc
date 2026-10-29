// Plain-language prompts, explanations and worked examples for each part of
// the change request. The section order follows the UCO change-request
// template. The worked example throughout is one invented request (drone
// flight logs); the competency example is the template's own.

export const GUIDANCE = {
  title: {
    heading: 'Name the concept',
    prompt: 'Give your request a short title that names the thing that cannot be represented today.',
    why: 'The title is how the request is found and discussed later.',
    placeholder: 'For example: Represent drone flight logs',
  },

  background: {
    heading: 'Background',
    prompt: 'Describe what you need, in your own words. You do not need to know how CASE or UCO work internally.',
    why: 'The committee asks for one sentence that answers "what do we achieve, for whom, and why does that matter?" The three short boxes below build that sentence.',
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
        placeholder: 'For example: Drone cases are increasing, and flight logs are often the key evidence, but tools currently have to invent their own representation.',
      },
      details: {
        label: 'Anything else the reader should know (optional)',
        placeholder: 'For example, how you represent this today, or a link to a tool or data format.',
      },
    },
  },

  requirements: {
    heading: 'Requirements',
    prompt: 'List what CASE/UCO must be able to do. Put one requirement in each box.',
    why: 'Each requirement is discussed and tested on its own, so a requirement should be a single statement that could be checked as met or not met.',
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
    placeholder: 'For example: Tools can exchange drone flight data without loss, and examiners can compare flight paths across cases.',
  },

  risks: {
    heading: 'Risks',
    prompt: 'Could this change cause problems? For example, overlap with an existing concept, or changes to existing data.',
    why: 'Risks include effects on existing ontologies, documentation or tools. If you do not know of any, say so: the committee will add risks found later.',
    placeholder: 'For example: It may overlap with the existing geolocation log concepts.',
    noneLabel: 'I am not aware of any risks',
  },

  competencies: {
    heading: 'Questions the data should answer',
    prompt: 'Describe a situation where the new concept would be used. Then write a question you would want to answer about that situation, and the answer you would expect.',
    why: 'If the change is accepted, data that uses the new concept should be able to answer your question, and today it cannot. The question shows the committee what the change is for, and gives them something to test it against. A situation is most useful when it includes things that should match the question and things that should not, because then a wrong answer can be detected.',
    terms: 'The committee calls these "competency questions". In the filed issue, each situation appears as a "Competency" and each question as a "Competency Question".',
    scenarioLabel: 'Situation',
    scenarioPlaceholder: 'For example: A drone was seized near a prison and its flight log was extracted. The log covers three flights.',
    questionLabel: 'Question you want to answer',
    questionPlaceholder: 'For example: Which flights passed over the prison boundary?',
    resultLabel: 'Expected answer, and how the data gives it',
    resultPlaceholder: 'For example: One flight. Two of its logged positions fall inside the prison boundary, and the other two flights stay outside it.',
    examplesSummary: 'Show two examples',
    examples: [
      {
        scenario: 'A drone was seized near a prison and its flight log was extracted. The log covers three flights.',
        question: 'Which flights passed over the prison boundary?',
        result: 'One flight. Two of its logged positions fall inside the prison boundary. The other two flights stay outside it, so they should not be returned.',
        source: 'An invented example, following the drone flight log example used elsewhere on this page.',
      },
      {
        scenario: 'Three picture files were produced on an analyst\'s workstation over the course of an investigation.',
        question: 'Which picture files were taken from the evidence, and which were taken of the evidence?',
        result: 'From reviewing the investigative actions in the chain of custody, picture files generated when the instrument was the analyst\'s camera would be "taken of", while picture files generated when the instrument was a data extraction kiosk would be "taken from".',
        source: 'This example is from the UCO change-request template.',
      },
    ],
    itemLabel: 'Situation',
    add: 'Add a situation',
    addQuestion: 'Add another question',
  },

  solution: {
    heading: 'Solution suggestion (optional)',
    prompt: 'If you have an idea of how CASE/UCO could be changed, describe it. You can leave this empty.',
    why: 'A summary of the intended changes helps the committee vote. It is fine to say "new class" or "new property on an existing class" without the exact details.',
    placeholder: 'For example: Define a new class for a drone flight log, and a property linking it to the drone.',
    mentionRelated: 'Mention the concepts I marked as related',
    transcriptionLabel: 'My examples may be copied into the CASE-Examples repository, with credit',
  },

  search: {
    heading: 'Existing concepts',
    prompt: 'Search CASE/UCO and its extensions before asking for something new. If it already exists, you may not need a change request.',
    placeholder: 'For example: drone, flight log, chain of custody',
    useTitle: 'Search for my title',
    coreHeading: 'Already in CASE/UCO',
    extensionHeading: 'In extensions (SOLVE-IT, CAC)',
    extensionNote: 'Extensions are maintained by other projects. A concept there is not part of CASE/UCO, but it shows how someone else has modelled the same idea.',
    nearlyFits: 'If this concept nearly fits, a request to correct or extend it may be more appropriate than a request for a new concept. This tool does not yet guide that kind of request.',
    mark: 'Mark as related',
    unmark: 'Marked as related',
    searchIssues: 'Search existing issues',
    empty: 'No matches. Try a shorter or different word.',
  },

  destination: {
    heading: 'Where it goes',
    prompt: 'Change requests go to either UCO or CASE. The suggestion below is based on the related concepts you marked, or on your search results.',
    duplicates: 'Before filing, check whether someone has already asked for this:',
  },
};
