import { Component, AfterViewInit, OnInit } from '@angular/core';
import { ActivatedRoute, Params, Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'app works!';
  private sub: any;
  path = '';
  //talents = [{ 'name': 'Theis', id: 1 }, { 'name': 'Sebastian', id: 2 }, { 'name': 'Yusufa', id: 3 }, { 'name': 'Nadir', id: 4 }];
  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    this.router.events.subscribe(route => {
      if (route instanceof NavigationEnd)
        this.path = route.url;
    }
    );
  }

}
