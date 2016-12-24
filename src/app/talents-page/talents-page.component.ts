import { Component, OnInit } from '@angular/core';
import { AngularFire, FirebaseListObservable, FirebaseObjectObservable } from 'angularfire2';

@Component({
  selector: 'app-talents-page',
  templateUrl: './talents-page.component.html',
  styleUrls: ['./talents-page.component.scss']
})
export class TalentsPageComponent implements OnInit {
  //talents = [{ 'name': 'Theis', id: 1 }, { 'name': 'Sebastian', id: 2 }, { 'name': 'Yusufa', id: 3 }, { 'name': 'Nadir', id: 4 }];
  talents: FirebaseListObservable<any[]>;

  constructor(private af: AngularFire) {
    this.talents = af.database.list('/talents');
  }

  ngOnInit() {
  }

  talentAwardPoint(talent) {
    const itemObservable = this.af.database.object(`/talents/${talent.$key}/points`);
    itemObservable.$ref.transaction(tagValue => {
      return tagValue ? tagValue + 1 : 1;
    });

    const talentEventList = this.af.database.list(`/talents/${talent.$key}/events`);
    const date = new Date();

    talentEventList.push({event: date.toString()});
    //itemObservable.update({ points: 2 });
    console.log(talent.$key);
  }


}
