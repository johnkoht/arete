/**
 * PRD/Task types with validators.
 *
 * Standalone — imports NOTHING from other model files.
 * Migrated from dev/autonomous/schema.ts.
 */
/** Validation helper for Task */
export function validateTask(task) {
    const errors = [];
    if (!task.id || typeof task.id !== 'string') {
        errors.push('Task must have a valid id');
    }
    if (!task.title || typeof task.title !== 'string') {
        errors.push('Task must have a title');
    }
    if (!task.description || typeof task.description !== 'string') {
        errors.push('Task must have a description');
    }
    if (!Array.isArray(task.acceptanceCriteria) || task.acceptanceCriteria.length === 0) {
        errors.push('Task must have at least one acceptance criterion');
    }
    const validStatuses = ['pending', 'in_progress', 'complete', 'failed'];
    if (!validStatuses.includes(task.status)) {
        errors.push(`Task status must be one of: ${validStatuses.join(', ')}`);
    }
    if (typeof task.passes !== 'boolean') {
        errors.push('Task must have a passes boolean');
    }
    if (typeof task.attemptCount !== 'number' || task.attemptCount < 0) {
        errors.push('Task must have a valid attemptCount (>= 0)');
    }
    return { valid: errors.length === 0, errors };
}
/** Validation helper for PRD */
export function validatePRD(prd) {
    const errors = [];
    if (!prd.name || typeof prd.name !== 'string') {
        errors.push('PRD must have a name');
    }
    if (!prd.branchName || typeof prd.branchName !== 'string') {
        errors.push('PRD must have a branchName');
    }
    if (!prd.goal || typeof prd.goal !== 'string') {
        errors.push('PRD must have a goal');
    }
    if (!Array.isArray(prd.userStories) || prd.userStories.length === 0) {
        errors.push('PRD must have at least one user story');
    }
    prd.userStories.forEach((task, index) => {
        const taskValidation = validateTask(task);
        if (!taskValidation.valid) {
            errors.push(`Task ${index} (${task.id}): ${taskValidation.errors.join(', ')}`);
        }
    });
    return { valid: errors.length === 0, errors };
}
//# sourceMappingURL=prd.js.map