import test from 'node:test';
import assert from 'node:assert/strict';
import { adminAccountSummary, adminOperationSummary, filterAdminUsers, filterAdminJobs, adminAuditPresentation } from '../src/admin-model.ts';

const users = [
  {id:'admin',username:'admin',full_name:'Quản trị viên',role:'admin',is_active:true,course_ids:[]},
  {id:'teacher',username:'teacher',full_name:'Giảng viên Nguyễn',role:'teacher',is_active:true,course_ids:['course-a']},
  {id:'student',username:'learner',full_name:'Học viên An',role:'student',is_active:false,course_ids:['course-a']},
  {id:'student2',username:'learner2',full_name:'Học viên Bình',role:'student',is_active:true,course_ids:[]},
];
const courses=[{id:'course-a',title:'Giải thuật',code:'GT'}];

test('Missing admin data remains unknown instead of reporting healthy zeros', () => {
  assert.equal(adminAccountSummary(null,courses),null);
  assert.equal(adminOperationSummary(null),null);
  assert.equal(adminAccountSummary([],courses).total,0);
});
test('Account search combines role, status and assignment without inventing enrollments', () => {
  assert.deepEqual(filterAdminUsers(users,{query:'giang vien nguyen',role:'teacher',status:'active',courseId:'course-a'}).map(u=>u.id),['teacher']);
  assert.deepEqual(filterAdminUsers(users,{role:'student',status:'disabled',courseId:'course-a'}).map(u=>u.id),['student']);
  const summary=adminAccountSummary(users,courses);
  assert.equal(summary.active,3); assert.equal(summary.disabled,1); assert.equal(summary.unassigned,1);
  assert.equal(summary.courses[0].teachers,1); assert.equal(summary.courses[0].students,1);
});
test('Operations distinguish teacher review and paused jobs from actual processing', () => {
  const jobs=['queued','running','paused','needs_review','failed','completed','cancelled'].map((status,i)=>({id:String(i),status,workflow:i===1?'tutor':'analysis',lecture_id:'lecture'}));
  const summary=adminOperationSummary({jobs,agents:[{}]});
  assert.equal(summary.processing,2); assert.equal(summary.needsReview,1); assert.equal(summary.paused,1); assert.equal(summary.cancelled,1);
  assert.equal(summary.completed,1); assert.equal(summary.failed,1); assert.equal(summary.configuredAgents,1);
  assert.deepEqual(filterAdminJobs(jobs,{workflow:'tutor',status:'running'}).map(job=>job.id),['1']);
});
test('Audit resolves account names and only renders recognized structured metadata', () => {
  const base={actor_id:'admin',actor_role:'admin',lecture_id:null};
  const account=adminAuditPresentation({...base,action:'UPDATE_USER',detail:'teacher'},users);
  assert.match(account.detail,/Giảng viên Nguyễn/); assert.equal(account.actor,'Quản trị viên');
  const job=adminAuditPresentation({...base,action:'START_WORKFLOW',detail:{workflow:'tutor',question:'PRIVATE QUESTION',answers:'PRIVATE ANSWERS'}},users);
  assert.equal(job.detail,'Hỗ trợ học tập'); assert.doesNotMatch(JSON.stringify(job),/PRIVATE/);
});
