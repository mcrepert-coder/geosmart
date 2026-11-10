const bool demoModeEnabled = bool.fromEnvironment(
  'GEOSMART_DEMO_MODE',
  defaultValue: false,
);

const String demoSessionId = 'demo-session';

const String projectId = String.fromEnvironment(
  'GEOSMART_PROJECT_ID',
  defaultValue: demoModeEnabled ? 'demo-project' : '',
);

const String surveyorId = String.fromEnvironment(
  'GEOSMART_SURVEYOR_ID',
  defaultValue: demoModeEnabled ? 'demo-surveyor' : '',
);
