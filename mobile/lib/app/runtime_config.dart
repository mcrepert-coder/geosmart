const bool demoModeEnabled = bool.fromEnvironment(
  'GEOSMART_DEMO_MODE',
  defaultValue: false,
);

const String apiBaseUrl = String.fromEnvironment(
  'GEOSMART_API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3001',
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
