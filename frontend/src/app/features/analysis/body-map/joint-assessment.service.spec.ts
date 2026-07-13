import { JointAssessmentService } from './joint-assessment.service';
import { JOINTS_28 } from './assessment-configs.data';

describe('JointAssessmentService', () => {
  let store: JointAssessmentService;

  beforeEach(() => {
    store = new JointAssessmentService();
    store.setActiveJoints(JOINTS_28);
  });

  it('starts with every joint not evaluated', () => {
    expect(store.statusOf('RIGHT_KNEE')).toBe('not-evaluated');
    expect(store.tenderCount()).toBe(0);
    expect(store.swollenCount()).toBe(0);
    expect(store.evaluatedCount()).toBe(0);
    expect(store.totalCount()).toBe(28);
  });

  it('derives the visual status from the findings', () => {
    store.setPain('RIGHT_MCP_3', true);
    expect(store.statusOf('RIGHT_MCP_3')).toBe('pain');

    store.setSwelling('RIGHT_MCP_3', true);
    expect(store.statusOf('RIGHT_MCP_3')).toBe('both');

    store.setPain('RIGHT_MCP_3', false);
    expect(store.statusOf('RIGHT_MCP_3')).toBe('swelling');

    store.setSwelling('RIGHT_MCP_3', false);
    expect(store.statusOf('RIGHT_MCP_3')).toBe('normal');
  });

  it('counts tender and swollen joints', () => {
    store.setEvaluation('RIGHT_KNEE', { pain: true, swelling: false });
    store.setEvaluation('LEFT_WRIST', { pain: true, swelling: true });

    expect(store.tenderCount()).toBe(2);
    expect(store.swollenCount()).toBe(1);
    expect(store.evaluatedCount()).toBe(2);
  });

  it('clears a single evaluation and resets all', () => {
    store.setPain('RIGHT_KNEE', true);
    store.clearEvaluation('RIGHT_KNEE');
    expect(store.statusOf('RIGHT_KNEE')).toBe('not-evaluated');

    store.setPain('LEFT_KNEE', true);
    store.reset();
    expect(store.evaluatedCount()).toBe(0);
  });

  it('only counts joints in the active assessment', () => {
    store.setActiveJoints(['RIGHT_KNEE']);
    store.setEvaluation('RIGHT_KNEE', { pain: true, swelling: false });
    store.setEvaluation('LEFT_KNEE', { pain: true, swelling: false }); // outside the active set

    expect(store.tenderCount()).toBe(1);
    expect(store.evaluatedCount()).toBe(1);
  });

  it('serializes to a result ready for the calculation algorithms', () => {
    store.setEvaluation('RIGHT_MCP_3', { pain: true, swelling: true });

    expect(store.toResult('CDAI', 123)).toEqual({
      patientId: 123,
      assessmentType: 'CDAI',
      joints: { RIGHT_MCP_3: { pain: true, swelling: true } },
    });
  });
});
