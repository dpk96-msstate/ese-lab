const members = {
  director: {
    name: "Dr. Tanmay Bhowmik",
    title: "Lab Director",
    affiliation: "Lab Director | Researcher | Requirements Engineering",
    image: "assets/Bhowmik_ProfilePic.jpg",
    linkedin: "https://www.linkedin.com/in/tanmay-bhowmik-219b9a222/",
    degree: "Director",
    category: "director"
  },
  
  collaborators: [
    {
      name: "Dr. Md Rayhan Amin",
      affiliation: "West Virginia University, USA",
      badge: "Collaborator",
      image: "assets/RayhanAmin.jpg",
      linkedin: "https://www.linkedin.com/in/md-rayhan-amin-1250a6105/",
      initials: "RA"
    }
  ],
  
  currentStudents: {
    phd: [
      {
        name: "Kushal Subedi",
        degree: "PhD",
        affiliation: "PhD Student",
        image: null,
        linkedin: null,
        initials: "KS"
      },
      {
        name: "Tahsin Tasnia Khan",
        degree: "PhD",
        affiliation: "PhD Student",
        image: "assets/TahsinTasnia.jpg",
        linkedin: "https://www.linkedin.com/in/tahsin-tasnia-342176162/",
        initials: "TK"
      },
      {
        name: "Quoc Bui",
        degree: "PhD",
        affiliation: "PhD Student",
        image: "assets/QuocBui.jpg",
        linkedin: null,
        initials: "QB"
      },
      {
        name: "Jagonmoy Dey",
        degree: "PhD",
        affiliation: "PhD Student",
        image: "assets/JagonmoyDey.jpg",
        linkedin: "https://www.linkedin.com/in/jagonmoy/",
        initials: "JD"
      },
      {
        name: "Daniel Knight",
        degree: "PhD",
        affiliation: "PhD Candidate",
        image: "assets/DanielKnight.jpg",
        linkedin: "https://www.linkedin.com/in/daniel-knight-71777654/",
        initials: "DK"
      }
    ],
    ms: [
      
    ]
  },
  
  alumni: {
    phd: [
      {
        name: "Dr. Md Rayhan Amin",
        degree: "PhD",
        affiliation: "Mississippi State University PhD Alumni",
        image: "assets/RayhanAmin.jpg",
        linkedin: "https://www.linkedin.com/in/md-rayhan-amin-1250a6105/",
        initials: "RA"
      },
      {
        name: "Dr. Kollin Napier",
        degree: "PhD",
        affiliation: "Mississippi State University PhD Alumni",
        image: "assets/KollinNapier.jpg",
        linkedin: "https://www.linkedin.com/in/kollin-napier/",
        initials: "KN"
      },
      {
        name: "Dr. Tanmay Bhowmik",
        degree: "PhD",
        affiliation: "Mississippi State University PhD Alumni",
        image: "assets/Bhowmik_ProfilePic.jpg",
        linkedin: "https://www.linkedin.com/in/tanmay-bhowmik-219b9a222/",
        initials: "TB"
      }
    ],
    postdoc: [
      
    ],
    ms: [
      
    ],
    bs: [
      
    ]
  },
  
  sigMembers: {
    coordinators: [
      {
        name: "Dr. Tanmay Bhowmik",
        affiliation: "Kennesaw State University, USA",
        role: "Chair",
        image: "assets/Bhowmik_ProfilePic.jpg",
        linkedin: "https://www.linkedin.com/in/tanmay-bhowmik-219b9a222/",
        initials: "TB"
      }
    ],
    members: [
      
    ]
  }
};

// Function to get initials from name
function getInitials(name) {
  return name.split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

// Function to render member card
function renderMemberCard(member, category) {
  const avatar = member.image 
    ? `<img src="${member.image}" alt="${member.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
    : member.initials || getInitials(member.name);
    
  const linkedin = member.linkedin 
    ? `<a href="${member.linkedin}" target="_blank" class="member-linkedin" style="display: inline-block; margin-top: 8px; color: #0077B5; text-decoration: none; font-size: 14px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 4px;">
          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
        </svg>
        LinkedIn
      </a>`
    : '';
    
  return `
    <div class="member-card" data-name="${member.name}" data-degree="${member.degree || ''}">
      <div class="member-avatar">${avatar}</div>
      <div class="member-info">
        <h4 class="member-name">${member.name}</h4>
        <p class="member-affiliation">${member.affiliation}</p>
        <span class="member-badge ${category}">${member.badge || member.degree || category}</span>
        ${linkedin}
      </div>
    </div>
  `;
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { members, getInitials, renderMemberCard };
}