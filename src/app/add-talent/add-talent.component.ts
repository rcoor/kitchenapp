import { Component, OnInit } from '@angular/core';
import { AngularFire, FirebaseListObservable, FirebaseObjectObservable } from 'angularfire2';
import { Router } from '@angular/router';
@Component({
  selector: 'app-add-talent',
  templateUrl: './add-talent.component.html',
  styleUrls: ['./add-talent.component.scss']
})
export class AddTalentComponent implements OnInit {

  talents: FirebaseListObservable<any>;
  talentName: string;
  constructor(private af: AngularFire, private router: Router) {
    this.talents = this.af.database.list(`/talents`);
  }

  ngOnInit() {
  }

  saveTalent() {
    if (this.talentName) {
      const talentName = this.talentName;
      this.talents.push({
        name: talentName, points: 0,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16)
      })
        .then(_ => this.router.navigate(['/']))
        .catch(err => console.log(err));
    }
  }

}
