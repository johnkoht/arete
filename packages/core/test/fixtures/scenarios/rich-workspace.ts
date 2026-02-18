import type { TestWorkspaceFixture } from '../index.js';

export function seedRichWorkspaceScenario(fixture: TestWorkspaceFixture): void {
  fixture.addPerson({
    slug: 'jane-doe',
    name: 'Jane Doe',
    category: 'internal',
    email: 'jane@acme.com',
    role: 'Product Manager',
  });
  fixture.addPerson({
    slug: 'alex-eng',
    name: 'Alex Eng',
    category: 'internal',
    email: 'alex@acme.com',
    role: 'Engineering Lead',
  });
  fixture.addPerson({
    slug: 'bob-buyer',
    name: 'Bob Buyer',
    category: 'customers',
    email: 'bob@acmecorp.com',
    role: 'Director of Operations',
  });

  fixture.addMeeting({
    slug: 'auth-blocker',
    date: '2026-01-15',
    title: 'Weekly 1:1 with Alex (Auth Blocker)',
    attendeeIds: ['jane-doe', 'alex-eng'],
    attendeesLabel: 'Jane Doe, Alex Eng',
    body: 'Auth dependency blocked onboarding step-3 work.',
  });
  fixture.addMeeting({
    slug: 'auth-unblocked',
    date: '2026-01-22',
    title: 'Weekly 1:1 with Alex (Auth Unblocked)',
    attendeeIds: ['jane-doe', 'alex-eng'],
    attendeesLabel: 'Jane Doe, Alex Eng',
    body: 'Fallback path unblocked work; team resumed sprint plan.',
  });

  fixture.addProject({
    slug: 'onboarding-discovery',
    status: 'active',
    readme: '# Onboarding Discovery\n\nActive project for onboarding improvements.',
  });

  fixture.addMemoryDecision({
    date: '2026-02-04',
    title: 'Proceed with onboarding v2 scope',
    body: '**Decision**: Keep full step-3 and admin improvements.',
  });
  fixture.addMemoryLearning({
    date: '2026-01-31',
    title: 'Step-3 is primary drop-off',
    body: '**Insight**: Users commonly stall at onboarding step-3.',
  });
}
