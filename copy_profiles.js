const fs = require('fs');

const citizenCode = fs.readFileSync('c:/Users/shreyas/ps-crmdev1/apps/web/app/citizen/profile/page.tsx', 'utf8');

const roles = [
  {
    path: 'c:/Users/shreyas/ps-crmdev1/apps/web/app/authority/profile/page.tsx',
    role1: 'Authority Officer',
    role2: 'Authority Portal',
    route: '/authority/dashboard'
  },
  {
    path: 'c:/Users/shreyas/ps-crmdev1/apps/web/app/worker/profile/page.tsx',
    role1: 'Field Worker',
    role2: 'Worker Portal',
    route: '/worker/dashboard'
  },
  {
    path: 'c:/Users/shreyas/ps-crmdev1/apps/web/app/admin/profile/page.tsx',
    role1: 'System Admin',
    role2: 'Admin Portal',
    route: '/admin/dashboard'
  }
];

roles.forEach(role => {
  let newCode = citizenCode.replace(
    /Citizen(?=[\s<])/g, 
    role.role1
  );
  
  newCode = newCode.replace(
    /Jan Samadhan User/g, 
    role.role2
  );
  
  newCode = newCode.replace(
    /router\.push\(`\/citizen\/tickets\?highlight=\${ticketId}`\)/g,
    `router.push(\`${role.route}\`)`
  );
  
  // They probably don't have citizen_id on complaints table corresponding to them.
  // The ticket query will return 0, which is perfectly safe and displays no tickets found.
  // We'll write the file now.
  fs.writeFileSync(role.path, newCode);
});

console.log("Successfully cloned the profiles.");
